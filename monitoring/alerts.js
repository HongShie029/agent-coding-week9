// [Mission 2] 알림 규칙 — 학생이 완성하는 파일
// 규칙 하나 = { id, severity: "page"(즉시 호출) | "ticket"(근무 시간 확인), runbook: "RB-…", evaluate(window, ctx) }
//   window : 최근 최대 120분의 분 단위 지표 배열(마지막 원소가 현재). 필드는 docs/OPS_CONTRACT.md 2장
//   ctx    : { t, minuteOfDay, slo, expectedRequests }   (이 시각의 평소 요청 수 = ops.expected(minuteOfDay))
//   반환   : true/false  (또는 { fire: true, reason })
// 평가: node scripts/eval.js alerts   (공개 시나리오 5개)
const ops = require("../lib/ops");

module.exports = {
  rules: [
    // 예시 규칙 — 일부러 둔하게 만들어 두었다. 이 규칙을 참고해 형식을 익히고, 다듬거나 지우고 새로 만든다.
    {
      id: "example-latency",
      severity: "page",
      runbook: "RB-EXAMPLE",
      evaluate: (window) => ops.allLast(window, 5, (s) => s.p95Ms > 2000), // 5분 연속 p95 > 2초
    },
    // TODO: 오류율(급등 / 느린 소진), 지연, 트래픽 급감, 결제 실패율, 추천 품질 …
    //       "한 번 튄 값"이 아니라 "계속되는가"(지속성)와 "평소와 얼마나 다른가"(상대 비교)를 생각한다.
  ],
};
