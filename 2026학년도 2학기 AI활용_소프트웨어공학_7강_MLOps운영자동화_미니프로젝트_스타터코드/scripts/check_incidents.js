#!/usr/bin/env node
// 장애 분석 결과(docs/incident_findings.json)의 형식을 점검한다. (정답 대조는 채점 때 교수자가 한다)
const fs = require("fs"), path = require("path");
const CAUSES = ["config_change", "code_regression", "data_quality", "external_dependency", "capacity", "resource_leak", "model_regression"];
const ACTIONS = ["rollback", "revert_config", "fix_data_pipeline", "retrain_after_fix", "scale_out", "failover_dependency", "add_circuit_breaker", "add_alert", "add_gate", "restart_service"];

function validate(findings) {
  const errs = [];
  if (!Array.isArray(findings) || findings.length === 0) return ["배열이 비어 있습니다"];
  for (const f of findings) {
    const id = f && f.incident;
    if (!/^INC-\d+$/.test(id || "")) { errs.push("incident 형식 오류(INC-1 …)"); continue; }
    if (!CAUSES.includes(f.rootCause)) errs.push(`${id}: rootCause 는 ${CAUSES.join("|")} 중 하나`);
    if (!(f.triggeringChange === null || /^[A-Z]+-[A-Z]*\d+$/.test(f.triggeringChange || ""))) errs.push(`${id}: triggeringChange 는 변경 ID(DEP-1042 …) 또는 null`);
    if (!/^\d\d:\d\d$/.test(f.firstBadTime || "")) errs.push(`${id}: firstBadTime 은 HH:MM`);
    if (!Array.isArray(f.evidence) || f.evidence.length === 0 || !f.evidence.every((e) => /^L\d{4}$/.test(e))) errs.push(`${id}: evidence 는 로그 ID(L0123) 배열`);
    if (!Array.isArray(f.actions) || f.actions.length === 0 || !f.actions.every((a) => ACTIONS.includes(a))) errs.push(`${id}: actions 는 ${ACTIONS.join("|")} 중에서`);
  }
  return errs;
}
// 정답 키와 대조해 점수(건당 10점)를 낸다 — 교수자용 채점에서 사용
function score(findings, keys) {
  const out = [];
  for (const [id, key] of Object.entries(keys)) {
    const f = (findings || []).find((x) => x.incident === id);
    if (!f) { out.push({ id, pts: 0, notes: ["제출 없음"] }); continue; }
    const notes = []; let pts = 0;
    if (f.rootCause === key.rootCause) pts += 3; else notes.push(`근본 원인 불일치(${f.rootCause} ≠ ${key.rootCause})`);
    if ((f.triggeringChange || null) === (key.change || null)) pts += 2; else notes.push(`원인 변경 불일치(${f.triggeringChange} ≠ ${key.change})`);
    const mm = (s) => { const [h, m] = String(s).split(":").map(Number); return h * 60 + m; };
    if (/^\d\d:\d\d$/.test(f.firstBadTime || "") && Math.abs(mm(f.firstBadTime) - mm(key.firstBadTime)) <= 5) pts += 1; else notes.push(`최초 이상 시각 불일치(${f.firstBadTime} ≠ ${key.firstBadTime})`);
    const ev = f.evidence || [];
    if (ev.some((e) => key.evidenceIds.includes(e))) pts += 1; else notes.push("핵심 근거 로그 없음");
    if (!ev.some((e) => key.herringIds.includes(e))) pts += 1; else notes.push("무관한 로그(미끼)를 근거로 인용");
    const acts = f.actions || [];
    for (const g of key.requiredActionGroups) { if (g.some((a) => acts.includes(a))) pts += 1; else notes.push(`필요한 조치 누락(${g.join("/")})`); }
    out.push({ id, pts, notes });
  }
  return out;
}
module.exports = { validate, score, CAUSES, ACTIONS };
if (require.main === module) {
  const p = path.resolve(__dirname, "..", "docs/incident_findings.json");
  let data; try { data = JSON.parse(fs.readFileSync(p, "utf8")); } catch (e) { console.log("✘ docs/incident_findings.json 을 읽을 수 없습니다: " + e.message); process.exit(1); }
  const errs = validate(data);
  if (errs.length) { errs.forEach((e) => console.log("✘ " + e)); process.exit(1); }
  console.log(`✔ 형식 OK — 인시던트 ${data.length}건 (정답 대조는 채점 때 이루어집니다)`);
}
