// [Mission 1] 파이프라인 품질 게이트 — 학생이 완성하는 파일
// 구조: stages[] → { name, gates[] } → gate = { id, check(change) → { pass, code?, reason? } }
//   change : 변경 매니페스트(docs/OPS_CONTRACT.md 4장). 단계는 위에서 아래로 실행되고, 처음 실패한 게이트에서 멈춘다.
//   code   : 차단 사유 코드(4.3 표). 코드가 틀리면 부분 점수만 받는다.
// 평가: node scripts/eval.js pipeline   (공개 변경 10건)
const { shouldPromote } = require("../mlops/policy");   // 모델 승격 판단은 Mission 3 에서 만든 함수를 재사용한다
const ok = { pass: true };
const fail = (code, reason) => ({ pass: false, code, reason });

module.exports = {
  stages: [
    { name: "validate", gates: [
      // TODO: 비밀 값 탐지, 위험한 마이그레이션
    ] },
    { name: "test", gates: [
      // 예시 게이트 — 실패한 테스트가 있으면 차단
      { id: "tests-pass", check: (c) => (c.tests.failed > 0 ? fail("TEST_FAIL", "실패한 테스트가 있음") : ok) },
      // TODO: 건너뛴 테스트 비율, 불안정(재시도), 커버리지 하락, 변이 점수(6강), 테스트 없음
    ] },
    { name: "model-eval", gates: [
      // TODO: c.model 이 있으면 shouldPromote(c.model.candidate, c.model.champion) 결과로 판단 (Mission 3 이후)
    ] },
    { name: "build", gates: [
      // TODO: 빌드 성공, 취약점(런타임 vs 개발 전용), 이미지 크기
    ] },
    { name: "staging", gates: [
      // TODO: 스테이징 스모크 테스트
    ] },
  ],
};
