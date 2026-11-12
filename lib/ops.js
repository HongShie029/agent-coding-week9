// 학생이 써도 되는 운영 지표 도우미 (읽기 전용). 사용: const ops = require("../lib/ops");
const { expectedRequests } = require("../sim/engine");

const sum = (w, k) => w.reduce((s, x) => s + (x[k] || 0), 0);
// 창(window) 안의 비율: 예) ratio(window, "errors", "requests")
const ratio = (w, num, den) => { const d = sum(w, den); return d === 0 ? 0 : sum(w, num) / d; };
const last = (w, n) => w.slice(Math.max(0, w.length - n));
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
const percentile = (a, p) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)]; };
// 번 레이트: 관측 오류율 ÷ 오류 예산(1 − 가용성 목표). 1 이면 예산을 딱 맞게 소진하는 속도
const burnRate = (errRate, availabilityTarget) => errRate / (1 - availabilityTarget);
// 연속 n 분 동안 조건이 모두 참인가
const allLast = (w, n, pred) => w.length >= n && last(w, n).every(pred);
// 이 시각의 평소 요청 수(일주기 반영)
const expected = expectedRequests;
// 두 분포(합이 1 인 배열)의 PSI(Population Stability Index). 0.1 미만 안정, 0.25 이상 큰 변화가 통상 기준
function psi(expectedDist, actualDist, eps = 1e-4) {
  let s = 0;
  for (let i = 0; i < expectedDist.length; i++) {
    const e = Math.max(expectedDist[i], eps), a = Math.max(actualDist[i], eps);
    s += (a - e) * Math.log(a / e);
  }
  return s;
}
module.exports = { sum, ratio, last, mean, percentile, burnRate, allLast, expected, psi };
