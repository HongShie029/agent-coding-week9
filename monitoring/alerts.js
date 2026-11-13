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
    {
      id: "traffic-drop",
      severity: "ticket",
      runbook: "RB-TRAFFIC-DROP",
      evaluate: (window) => {
        // 최근 10분의 실제 요청량과 시간대별 예상 요청량을 비교한다.
        const recent = ops.last(window, 10);

        if (recent.length < 10) return false;

        const actualRequests = ops.sum(recent, "requests");
        const expectedRequests = recent.reduce(
          (total, sample) => total + ops.expected(sample.minuteOfDay),
          0
        );

        // 예상 요청량의 절반 미만으로 10분간 떨어지면 확인 티켓을 발행한다.
        return expectedRequests > 0 &&
          actualRequests < expectedRequests * 0.5;
      },
    },
        {
      id: "payment-failure",
      severity: "page",
      runbook: "RB-PAYMENT-FAILURE",
      evaluate: (window) => {
        // 최근 15분의 결제 시도와 실패 건수를 확인한다.
        const recent = ops.last(window, 15);

        if (recent.length < 15) return false;

        const attempts = ops.sum(recent, "paymentAttempts");
        const failures = ops.sum(recent, "paymentFails");

        // 표본이 100건 미만이면 비율이 불안정할 수 있어 판단하지 않는다.
        if (attempts < 100) return false;

        // 결제 실패율이 SLO 허용 상한 5%를 초과하면 호출한다.
        return failures / attempts > 0.05;
      },
    },
        {
      id: "recommendation-quality",
      severity: "ticket",
      runbook: "RB-RECOMMENDATION-QUALITY",
      evaluate: (window, ctx) => {
        // 최근 30분의 추천 노출과 클릭 데이터를 확인한다.
        const recent = ops.last(window, 30);

        if (recent.length < 30) return false;

        const impressions = ops.sum(recent, "recImpr");
        const clicks = ops.sum(recent, "recClicks");

        // 노출 표본이 적으면 CTR이 불안정하므로 판단하지 않는다.
        if (impressions < 1000) return false;

        const ctr = clicks / impressions;
        const threshold = ctx.slo.recCtrBaseline * 0.7;

        // 평소 CTR의 70% 미만으로 하락하면 확인 티켓을 발행한다.
        return ctr < threshold;
      },
    },
        {
      id: "error-rate-slow",
      severity: "ticket",
      runbook: "RB-ERROR-SLOW",
      evaluate: (window) => {
        // 최근 20분의 오류율을 확인한다.
        const recent = ops.last(window, 20);

        if (recent.length < 20) return false;

        // 요청 표본이 충분하고 오류율이 1% 이상인 분을 센다.
        const sustainedErrorMinutes = recent.filter(
          (s) =>
            s.requests >= 100 &&
            s.errors / s.requests >= 0.01
        ).length;

        // 최근 20분 중 15분 이상 지속되면 확인 티켓을 발행한다.
        return sustainedErrorMinutes >= 15;
      },
    },
  ],
};
