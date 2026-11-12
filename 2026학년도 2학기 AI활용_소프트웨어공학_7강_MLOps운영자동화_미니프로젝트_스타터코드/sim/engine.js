// 운영 지표 시뮬레이터 엔진 — 분 단위 지표를 결정적으로 만든다. (읽기 전용)
// 같은 (seed, t, arm) 이면 항상 같은 값이 나온다.
const { rngFor, gauss, binom } = require("./rng");

const BASE_RPM = 1200;                              // 하루 평균 분당 요청 수
const diurnal = (m) => 1 + 0.6 * Math.sin((2 * Math.PI * (m - 540)) / 1440); // 15:00 피크, 03:00 최저
const expectedRequests = (minuteOfDay) => Math.round(BASE_RPM * diurnal(minuteOfDay));
const BASE = { errRate: 0.004, payShare: 0.04, payFail: 0.015, imprShare: 0.5, ctr: 0.08 };
const p95Base = (m) => 330 + 70 * diurnal(m);

// 이벤트: { type, start, end, value, ramp?, arm? }  (분 단위, [start,end) 구간)
//  err   : 오류율에 value 를 더한다            payFail : 결제 실패율에 더한다
//  p95   : p95 지연(ms)에 value 를 더한다        p95mult : p95 에 곱한다
//  traffic : 요청 수에 value 를 곱한다           ctr : 추천 클릭률에 value 를 곱한다
//  ramp  : 시작 후 ramp 분에 걸쳐 서서히 커진다
function effect(events, t, type, arm) {
  let add = 0, mult = 1;
  for (const e of events || []) {
    if (e.type !== type) continue;
    if (e.arm && e.arm !== "both" && e.arm !== arm) continue;
    if (t < e.start || t >= e.end) continue;
    const f = e.ramp ? Math.min(1, (t - e.start + 1) / e.ramp) : 1;
    if (type === "traffic" || type === "ctr" || type === "p95mult") mult *= 1 + (e.value - 1) * f;
    else add += e.value * f;
  }
  return { add, mult };
}

// 한 분의 지표 표본. share: 이 갈래가 받는 트래픽 비율(카나리 5% 면 0.05)
function sampleAt({ seed, t, startMinuteOfDay = 0, events = [], share = 1, arm = "all" }) {
  const r = rngFor(seed, t, arm === "canary" ? 1 : arm === "baseline" ? 2 : 0);
  const minuteOfDay = (startMinuteOfDay + t) % 1440;
  const tm = effect(events, t, "traffic", arm).mult;
  const mean = expectedRequests(minuteOfDay) * share * tm;
  const requests = Math.max(0, Math.round(mean * (1 + 0.03 * gauss(r))));
  const errRate = Math.min(1, Math.max(0, BASE.errRate + effect(events, t, "err", arm).add));
  const errors = binom(r, requests, errRate);
  const pe = effect(events, t, "p95", arm), pm = effect(events, t, "p95mult", arm);
  const noise = 18 * Math.max(1, Math.sqrt(1 / Math.max(share, 0.02)) * 0.5);
  const p95Ms = Math.max(50, Math.round((p95Base(minuteOfDay) + pe.add) * pm.mult + noise * gauss(r)));
  const paymentAttempts = binom(r, requests, BASE.payShare);
  const payRate = Math.min(1, Math.max(0, BASE.payFail + effect(events, t, "payFail", arm).add));
  const paymentFails = binom(r, paymentAttempts, payRate);
  const recImpr = binom(r, requests, BASE.imprShare);
  const recClicks = binom(r, recImpr, BASE.ctr * effect(events, t, "ctr", arm).mult);
  return Object.freeze({ t, minuteOfDay, requests, errors, p95Ms, paymentAttempts, paymentFails, recImpr, recClicks });
}

function buildSeries(spec) {
  const out = [];
  for (let t = 0; t < (spec.minutes || 1440); t++) {
    out.push(sampleAt({ seed: spec.seed, t, startMinuteOfDay: spec.startMinuteOfDay || 0, events: spec.events }));
  }
  return out;
}

module.exports = { BASE_RPM, BASE, diurnal, expectedRequests, p95Base, sampleAt, buildSeries, effect };
