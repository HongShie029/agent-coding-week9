// 파이프라인 게이트 평가기: 변경(change) 하나를 단계별 게이트에 통과시켜 통과/차단과 사유 코드를 비교한다.
const { balanced } = require("./balance");
function runChange(config, change) {
  const trace = [];
  for (const stage of (config && config.stages) || []) {
    for (const gate of stage.gates || []) {
      let r;
      try { const view = JSON.parse(JSON.stringify(change)); delete view.expected; delete view.hard; r = gate.check(view) || {}; }
      catch (e) { r = { pass: false, code: "GATE_ERROR", reason: e.message }; }
      trace.push({ stage: stage.name, gate: gate.id, pass: r.pass === true, code: r.code });
      if (r.pass !== true) return { decision: "block", code: r.code || "UNKNOWN", stage: stage.name, gate: gate.id, trace };
    }
  }
  return { decision: "pass", trace };
}

function run(config, changes) {
  const items = changes.map((c) => {
    const r = runChange(config, c);
    const exp = c.expected;
    let score, detail;
    if (exp.decision === "pass") {
      score = r.decision === "pass" ? 1 : 0;
      detail = r.decision === "pass" ? "통과(정상)" : `잘못 차단됨 [${r.code}] (${r.gate})`;
    } else if (r.decision === "pass") { score = 0; detail = "차단했어야 하는데 통과시킴 (위험!) 기대 " + exp.codes.join("/"); }
    else if (exp.codes.includes(r.code)) { score = 1; detail = `차단(${r.code})`; }
    else { score = 0.5; detail = `차단은 맞으나 사유 코드가 다름: ${r.code} (기대 ${exp.codes.join("/")})`; }
    return { id: c.id, title: c.title, kind: exp.decision === "pass" ? "neg" : "pos", score, detail, escaped: exp.decision === "block" && r.decision === "pass", hard: !!c.hard };
  });
  return { name: "파이프라인 게이트", score: balanced(items), items };
}
module.exports = { run, runChange };
