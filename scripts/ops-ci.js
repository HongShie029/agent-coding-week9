#!/usr/bin/env node
// 운영 품질 게이트(ops-ci): 팀의 운영 산출물이 기준을 넘지 않으면 실패(종료 코드 1)한다.
// Mission 5 에서 THRESHOLDS 를 정하고 근거를 쓴다.  사용: node scripts/ops-ci.js [--dir ai_ops]
const path = require("path");
const { runAll } = require("../sim/eval");
const { check } = require("./check_runbook");

// 기준값(0~1): AI 산출물(ai_ops/)은 실패하고 우리 산출물은 통과하도록 정했다.
// 근거는 docs/OPS_REPORT.md 에 적는다.
const THRESHOLDS = { pipeline: 0.8, alerts: 0.8, policy: 0.7, rollout: 0.8, runbook: 1 };

const root = path.resolve(__dirname, "..");
const di = process.argv.indexOf("--dir"); const dir = di >= 0 ? process.argv[di + 1] : null;
const res = runAll(root, { dir });
const rb = check(root, { dir });
const results = [];
const step = (name, value, min) => { const ok = value >= min; results.push(ok); console.log(`${ok ? "✔" : "✘"} ${name} — ${(value * 100).toFixed(0)}% (기준 ${(min * 100).toFixed(0)}% 이상)`); };
step("파이프라인 게이트", res.pipeline.score, THRESHOLDS.pipeline);
step("알림 규칙", res.alerts.score, THRESHOLDS.alerts);
step("MLOps 정책", res.policy.score, THRESHOLDS.policy);
step("점진 배포", res.rollout.score, THRESHOLDS.rollout);
step("런북 완결성", rb.score, THRESHOLDS.runbook);
const failed = results.some((r) => !r);
console.log(failed ? "\nOPS-CI 실패" : "\nOPS-CI 통과");
process.exit(failed ? 1 : 0);
