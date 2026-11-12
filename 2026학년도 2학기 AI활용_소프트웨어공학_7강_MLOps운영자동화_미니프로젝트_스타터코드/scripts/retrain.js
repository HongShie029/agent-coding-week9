#!/usr/bin/env node
// 재학습 → 평가 → 승격 판단 → 레지스트리 등록을 한 번에 돌려 본다.
// 사용: node scripts/retrain.js [--scenario normal|shift|dirty]
const path = require("path"), crypto = require("crypto");
const { generate } = require("../sim/orders");
const { train, evaluate } = require("../src/recommender");
const { createRegistry } = require("../src/registry");
const policy = require("../mlops/policy");

const si = process.argv.indexOf("--scenario"); const scenario = si >= 0 ? process.argv[si + 1] : "normal";
const orders = generate(scenario);
const hash = (x) => crypto.createHash("sha1").update(JSON.stringify(x)).digest("hex").slice(0, 10);

// 챔피언(현재 운영 모델)은 0~44일, 후보(재학습)는 15~54일 데이터로 학습하고, 둘 다 55~59일 데이터로 평가한다.
const champM = train(orders, { fromDay: 0, toDay: 44 }), candM = train(orders, { fromDay: 15, toDay: 54 });
const ev = { fromDay: 55, toDay: 59 };
const ce = evaluate(champM, orders, ev), de = evaluate(candM, orders, ev);
const champion = { version: "v1", evalSet: { size: ce.size }, hitRatePct: ce.hitRatePct, segments: ce.segments, latencyMs: ce.latencyMs };
const candidate = { version: "v2", evalSet: { size: de.size, overlapWithTrain: de.overlapWithTrain }, hitRatePct: de.hitRatePct, ci95: de.ci95, segments: de.segments, latencyMs: de.latencyMs, trainedOn: { nullRate: candM.trainedOn.nullRate } };

console.log(`시나리오: ${scenario}`);
console.log(`챔피언 v1  적중률 ${champion.hitRatePct}%  (신규 ${champion.segments.new.hitRatePct} / 기존 ${champion.segments.returning.hitRatePct})`);
console.log(`후보   v2  적중률 ${candidate.hitRatePct}%  95% 신뢰구간 [${candidate.ci95.join(", ")}]  (신규 ${candidate.segments.new.hitRatePct} / 기존 ${candidate.segments.returning.hitRatePct})`);
console.log(`           평가 ${candidate.evalSet.size}건, 학습과 겹침 ${candidate.evalSet.overlapWithTrain}건, 학습 데이터 결측 ${(candidate.trainedOn.nullRate * 100).toFixed(1)}%, 지연 ${candidate.latencyMs}ms`);

const reg = createRegistry();
const v1 = reg.register({ meta: { dataHash: hash([0, 44]), commit: "a1b2c3d", metrics: { hitRatePct: champion.hitRatePct } } }); reg.promote(v1);
const decision = policy.shouldPromote(JSON.parse(JSON.stringify(candidate)), JSON.parse(JSON.stringify(champion)));
console.log(`\n승격 판단: ${decision.promote ? "승격" : "거절"} [${decision.code || ""}] ${decision.reason || ""}`);
const v2 = reg.register({ meta: { dataHash: hash([15, 54]), commit: "a1b2c3d", metrics: { hitRatePct: candidate.hitRatePct } } });
if (decision.promote) reg.promote(v2);
console.log("운영 모델:", reg.current().version, " 감사 결과:", reg.audit().length ? reg.audit() : "이상 없음");
