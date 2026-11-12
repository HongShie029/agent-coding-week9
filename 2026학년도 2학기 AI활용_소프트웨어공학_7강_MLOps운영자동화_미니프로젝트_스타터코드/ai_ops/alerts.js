// AI 가 만들어 준 알림 규칙 (코딩 에이전트에게 "쇼핑몰 알림 규칙 만들어줘"라고 요청한 결과라고 가정)
module.exports = {
  rules: [
    {
      id: "high-error-rate",
      severity: "page",
      evaluate(window) {
        const s = window[window.length - 1];
        return s.requests > 0 && s.errors / s.requests > 0.05; // 오류율 5% 초과
      },
    },
    {
      id: "high-latency",
      severity: "page",
      evaluate(window) {
        return window[window.length - 1].p95Ms > 1000; // p95 1초 초과
      },
    },
    {
      id: "some-errors",
      severity: "ticket",
      evaluate(window) {
        return window[window.length - 1].errors > 50;
      },
    },
  ],
};
