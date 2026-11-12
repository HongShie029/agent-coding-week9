// [Mission 4] 카나리 롤아웃 판단 — 학생이 완성하는 파일
// 새 버전을 5% → 25% → 50% 로 늘려 가며 매 분 decide() 를 부른다. (규칙: docs/OPS_CONTRACT.md 6장)
//   ctx = { trafficPct, stepIndex, minuteInStep, elapsed, canary[], baseline[], slo }
//         canary / baseline : 이 단계 시작 이후의 분 단위 지표 배열(같은 시각의 두 갈래: 새 버전 vs 기존 버전)
//   반환 { action: "promote" | "hold" | "rollback", reason }
//   한 단계에서 30분 넘게 hold 하면 안전을 위해 자동 롤백된다.
// 평가: node scripts/eval.js rollout   (공개 릴리스 5개)
const ops = require("../lib/ops");

function decide(ctx) {
  // TODO: 카나리를 "같은 시각의 기존 버전"과 비교한다. 작은 표본의 잡음과 외부 장애를 어떻게 구분할까?
  return { action: "hold", reason: "아직 구현하지 않음" };
}
module.exports = { decide };
