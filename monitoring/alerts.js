// [Mission 2] 알림 규칙 — 학생이 완성하는 파일
// 규칙 하나 = { id, severity: "page"(즉시 호출) | "ticket"(근무 시간 확인), runbook: "RB-…", evaluate(window, ctx) }
//   window : 최근 최대 120분의 분 단위 지표 배열(마지막 원소가 현재). 필드는 docs/OPS_CONTRACT.md 2장
//   ctx    : { t, minuteOfDay, slo, expectedRequests }   (이 시각의 평소 요청 수 = ops.expected(minuteOfDay))
//   반환   : true/false  (또는 { fire: true, reason })
// 평가: node scripts/eval.js alerts   (공개 시나리오 5개)

// [Mission 2] 알림 규칙

const ops = require("../lib/ops");

module.exports = {
  rules: [
    {
      id: "error-rate-fast",
      severity: "page",
      runbook: "RB-ERROR-FAST",

      // 요청 표본이 충분하고 오류율 2% 이상이
      // 5분 연속 지속되면 즉시 호출한다.
      evaluate: (window) => ops.allLast(
        window,
        5,
        (s) => s.requests >= 100 &&
          (s.errors / s.requests) >= 0.02
      ),
    },
    {
      id: "latency-creep",
      severity: "page",
      runbook: "RB-LATENCY-CREEP",

      // 최근 15분 데이터가 모두 있어야 판단한다.
      // p95가 SLO 기준을 초과한 분이 10분 이상이면 호출한다.
      evaluate: (window, ctx) => {
        
const recent = ops.last(window, 8);

// SLO의 90%인 지점부터 지연 증가를 조기에 감지한다.
// 최근 8분 중 5분 이상 기준을 초과해야 호출한다.
const earlyWarningThreshold = ctx.slo.p95Ms * 0.9;

return recent.length === 8 &&
  recent.filter(
    (s) => s.p95Ms > earlyWarningThreshold
  ).length >= 5;
      },
    },
  ],
};
