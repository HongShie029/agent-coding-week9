// 알림 규칙 평가기: 규칙을 분 단위로 돌려 감지 시간과 오탐(불필요한 호출)을 측정한다.
const { buildSeries, expectedRequests } = require("../engine");
const slo = require("../../config/slo.json");
const { balanced } = require("./balance");

function runScenario(mod, sc) {
  const series = buildSeries({ seed: sc.seed, minutes: sc.minutes || 1440, startMinuteOfDay: sc.startMinuteOfDay, events: sc.events });
  const fires = [], errors = new Set();
  for (let t = 0; t < series.length; t++) {
    const window = series.slice(Math.max(0, t - 119), t + 1);
    const ctx = { t, minuteOfDay: series[t].minuteOfDay, slo, expectedRequests };
    for (const rule of (mod && mod.rules) || []) {
      try {
        const r = rule.evaluate(window.slice(), ctx);
        if (r === true || (r && r.fire === true)) fires.push({ t, severity: rule.severity, id: rule.id });
      } catch (e) { errors.add(`${rule.id}: ${e.message}`); }
    }
  }
  const pageT = [...new Set(fires.filter((f) => f.severity === "page").map((f) => f.t))].sort((a, b) => a - b);
  const anyT = [...new Set(fires.map((f) => f.t))].sort((a, b) => a - b);
  const episodes = []; // 호출(page) 에피소드: 10분 이내 간격은 하나로 묶는다
  for (const t of pageT) { const e = episodes[episodes.length - 1]; if (e && t - e.end <= 10) e.end = t; else episodes.push({ start: t, end: t }); }
  const inc = sc.incident;
  const falseEp = episodes.filter((e) => !inc || e.start < inc.start || e.start > inc.end + 30).length;
  let detectAt = null;
  if (inc) { const pool = sc.expect === "any" ? anyT : pageT; detectAt = pool.find((t) => t >= inc.start && t <= inc.end + 30) ?? null; }
  const delay = detectAt === null ? null : detectAt - inc.start;
  let score;
  if (sc.expect === "none") score = falseEp === 0 ? 1 : 0;
  else {
    const base = delay === null ? 0 : delay <= sc.sla ? 1 : delay <= 2 * sc.sla ? 0.5 : 0;
    score = base * (falseEp > 0 ? 0.5 : 1);
  }
  const fired = [...new Set(fires.map((f) => f.id))];
  let detail;
  if (sc.expect === "none") detail = falseEp === 0 ? "호출 없음 (정상)" : `불필요한 호출 ${falseEp}회`;
  else detail = (delay === null ? "감지 못 함" : `${delay}분 만에 감지 (기준 ${sc.sla}분)`) + (falseEp ? `, 불필요한 호출 ${falseEp}회` : "");
  return { id: sc.id, title: sc.title, kind: sc.expect === "none" ? "neg" : "pos", score, detail, hard: !!sc.hard, fired, errors: [...errors] };
}

function run(mod, scenarios) {
  const items = scenarios.map((s) => runScenario(mod, s));
  return { name: "알림 규칙", score: balanced(items), items };
}
module.exports = { run, runScenario };
