// 드리프트 · 재학습 · 승격 정책 평가기
const { REF, buildHistory } = require("../drift");
const { balanced } = require("./balance");

function runDrift(policy, sc) {
  const hist = buildHistory(sc);
  let ref = { priceBins: [...REF.priceBins], catBins: [...REF.catBins] };
  let lastRetrainDay = -999;
  const days = []; // {day, kind, action}
  let broken = null;
  for (let d = 0; d < hist.length; d++) {
    let det, act;
    try {
      det = policy.detectDrift(hist.slice(0, d + 1), { reference: ref, today: d }) || {};
      const kind = det.drift ? det.kind : "none";
      act = policy.retrainDecision({ drift: det, history: hist.slice(0, d + 1), today: d, lastRetrainDay, reference: ref }) || "hold";
      days.push({ day: d, kind: kind || "none", action: act });
    } catch (e) { broken = e.message; days.push({ day: d, kind: "none", action: "hold" }); }
    if (days[days.length - 1].action === "retrain") {
      lastRetrainDay = d;
      const w = hist.slice(Math.max(0, d - 2), d + 1);
      ref = { priceBins: REF.priceBins.map((_, i) => w.reduce((s, x) => s + x.priceBins[i], 0) / w.length), catBins: REF.catBins.map((_, i) => w.reduce((s, x) => s + x.catBins[i], 0) / w.length) };
    }
  }
  const onset = sc.onset ?? 0, exp = sc.expectKind;
  const alarmsBefore = days.filter((x) => x.day < onset && x.kind !== "none").length;
  const retrains = days.filter((x) => x.action === "retrain");
  const fixes = days.filter((x) => x.action === "fix_data");
  let score, detail;
  if (exp === "none") {
    const bad = days.filter((x) => x.kind !== "none" || x.action !== "hold").length;
    score = bad === 0 ? 1 : 0; detail = bad === 0 ? "경보·조치 없음 (정상)" : `불필요한 경보/조치 ${bad}일`;
  } else {
    const det = days.find((x) => x.day >= onset && x.kind === exp);
    const delay = det ? det.day - onset : null;
    const detS = delay === null ? 0 : delay <= sc.sla ? 0.4 : delay <= 2 * sc.sla + 2 ? 0.2 : 0;
    let actS = 0, cleanS = 0;
    if (exp === "covariate") {
      const first = retrains.find((x) => x.day >= onset);
      actS = first && first.day - onset <= sc.sla + 1 ? 0.3 : first ? 0.15 : 0;
      cleanS = det && alarmsBefore === 0 && fixes.length === 0 && retrains.length <= 2 ? 0.3 : 0;
    } else {
      const first = fixes.find((x) => x.day >= onset);
      actS = first && first.day - onset <= sc.sla ? 0.3 : first ? 0.15 : 0;
      cleanS = det && retrains.length === 0 && alarmsBefore === 0 ? 0.3 : 0; // 나쁜 데이터로 재학습하면 0점
    }
    score = detS + actS + cleanS;
    detail = `감지 ${delay === null ? "못 함" : delay + "일 후"}, 재학습 ${retrains.length}회, 데이터 수정 요청 ${fixes.length}일` + (alarmsBefore ? `, 발생 전 경보 ${alarmsBefore}일` : "");
  }
  if (broken) detail += ` [오류: ${broken}]`;
  return { id: sc.id, title: sc.title, kind: exp === "none" ? "neg" : "pos", score, detail, hard: !!sc.hard };
}

function runPromote(policy, c) {
  let r;
  try { r = policy.shouldPromote(JSON.parse(JSON.stringify(c.candidate)), JSON.parse(JSON.stringify(c.champion))) || {}; }
  catch (e) { r = { promote: false, code: "ERROR", reason: e.message }; }
  const exp = c.expected; let score, detail;
  if (exp.promote) { score = r.promote === true ? 1 : 0; detail = score ? "승격(정상)" : `잘못 거절됨 [${r.code}]`; }
  else if (r.promote === true) { score = 0; detail = "승격하면 안 되는데 승격함 (위험!)"; }
  else if (exp.codes.includes(r.code)) { score = 1; detail = `거절(${r.code})`; }
  else { score = 0.5; detail = `거절은 맞으나 사유 코드가 다름: ${r.code} (기대 ${exp.codes.join("/")})`; }
  return { id: c.id, title: c.title, kind: exp.promote ? "pos" : "neg", score, detail, hard: !!c.hard };
}

function run(policy, { drift, cases }) {
  const d = (drift || []).map((s) => runDrift(policy, s));
  const p = (cases || []).map((c) => runPromote(policy, c));
  const bd = balanced(d), bp = balanced(p);
  return { name: "MLOps 정책", driftScore: bd, promoteScore: bp, score: (bd + bp) / 2, driftItems: d, promoteItems: p, items: [...d, ...p] };
}
module.exports = { run, runDrift, runPromote };
