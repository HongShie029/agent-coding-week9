// 점진 배포 평가기
const { runRollout } = require("../rollout");
const { balanced } = require("./balance");

function run(mod, specs) {
  const slo = require("../../config/slo.json");
  const items = specs.map((sp) => {
    const r = runRollout((ctx) => mod.decide({ ...ctx, slo }), sp);
    let score, detail;
    if (!sp.bad) {
      score = r.outcome === "complete" ? 1 : 0;
      detail = r.outcome === "complete" ? `완료 (${r.at}분)` : `정상 릴리스를 롤백함 (${r.at}분, ${r.reason || ""})`;
    } else if (r.outcome !== "rollback") { score = 0; detail = "나쁜 릴리스를 100% 배포함 (위험!)"; }
    else {
      const e = r.exposure;
      score = e <= sp.exposureFull ? 1 : e <= sp.exposureHalf ? 0.5 : 0.25;
      detail = `${r.at}분에 롤백, 피해 노출 ${e} (%·분; 만점 기준 ${sp.exposureFull})`;
    }
    if (r.notes.length) detail += ` [${r.notes[0]}]`;
    return { id: sp.id, title: sp.title, kind: sp.bad ? "pos" : "neg", score, detail, hard: !!sp.hard };
  });
  return { name: "점진 배포", score: balanced(items), items };
}
module.exports = { run };
