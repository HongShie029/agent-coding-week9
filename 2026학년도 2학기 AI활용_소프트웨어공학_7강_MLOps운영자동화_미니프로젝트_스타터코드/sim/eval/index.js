// 평가기 묶음: 공개 시나리오로 학생(또는 AI) 산출물을 평가한다.
const fs = require("fs"), path = require("path");
const alertsEval = require("./alerts"), pipelineEval = require("./pipeline"), policyEval = require("./policy"), rolloutEval = require("./rollout");
const pub = require("../data/public");

const DEFAULT_FILES = { alerts: "monitoring/alerts.js", pipeline: "pipeline/pipeline.config.js", policy: "mlops/policy.js", rollout: "deploy/rollout.js" };
const AI_FILES = { alerts: "alerts.js", pipeline: "pipeline.config.js", policy: "policy.js", rollout: "rollout.js" };

function loadPublicSets(root) {
  const changes = fs.readdirSync(path.join(root, "changes")).filter((f) => f.endsWith(".json")).sort().map((f) => JSON.parse(fs.readFileSync(path.join(root, "changes", f), "utf8")));
  const cases = JSON.parse(fs.readFileSync(path.join(root, "mlops/cases/public.json"), "utf8"));
  return { alerts: pub.alerts, drift: pub.drift, rollouts: pub.rollouts, changes, cases };
}

function load(root, dir, key) {
  const rel = dir ? path.join(dir, AI_FILES[key]) : DEFAULT_FILES[key];
  const p = path.resolve(root, rel);
  try { delete require.cache[require.resolve(p)]; return { mod: require(p), rel }; }
  catch (e) { return { error: `${rel} 을(를) 불러오지 못했습니다: ${e.message.split("\n")[0]}`, rel }; }
}

function runAll(root, { dir = null, sets, only } = {}) {
  sets = sets || loadPublicSets(root);
  const out = {};
  const guard = (key, fn, empty) => {
    if (only && !only.includes(key)) return { ...empty, skipped: true };
    const l = load(root, dir, key);
    if (l.error) return { ...empty, error: l.error };
    try { return fn(l.mod); } catch (e) { return { ...empty, error: `${l.rel}: ${e.message}` }; }
  };
  out.pipeline = guard("pipeline", (m) => pipelineEval.run(m, sets.changes), { name: "파이프라인 게이트", score: 0, items: [] });
  out.alerts = guard("alerts", (m) => alertsEval.run(m, sets.alerts), { name: "알림 규칙", score: 0, items: [] });
  out.policy = guard("policy", (m) => policyEval.run(m, { drift: sets.drift, cases: sets.cases }), { name: "MLOps 정책", score: 0, driftScore: 0, promoteScore: 0, items: [] });
  out.rollout = guard("rollout", (m) => rolloutEval.run(m, sets.rollouts), { name: "점진 배포", score: 0, items: [] });
  const w = { pipeline: 10, alerts: 10, policy: 10, rollout: 10 };
  out.points = Object.fromEntries(Object.keys(w).map((k) => [k, Math.round(out[k].score * w[k] * 100) / 100]));
  out.total = Math.round(Object.values(out.points).reduce((a, b) => a + b, 0) * 100) / 100;
  return out;
}

function print(res, only) {
  const mark = (s) => (s >= 0.999 ? "✔" : s > 0 ? "△" : "✘");
  const keys = only && only !== "all" ? [only] : ["pipeline", "alerts", "policy", "rollout"];
  const w = { pipeline: 10, alerts: 10, policy: 10, rollout: 10 };
  for (const k of keys) {
    const r = res[k];
    console.log(`\n[${r.name}]  ${(r.score * 100).toFixed(0)}%  → ${res.points[k]}/${w[k]}점`);
    if (r.error) console.log("  ! " + r.error);
    for (const i of r.items) console.log(`  ${mark(i.score)} ${i.id} ${i.title} — ${i.detail}`);
  }
  if (!only || only === "all") console.log(`\n자동 평가 합계(공개 시나리오 기준): ${res.total}/40점`);
}
module.exports = { runAll, loadPublicSets, print };
