// 일 단위 입력 데이터 분포 시뮬레이터 (드리프트 · 데이터 품질 시나리오)
const { rngFor, gauss, binom } = require("./rng");

// 학습 시점의 기준 분포 (reference): 가격대 10구간, 카테고리 6구간
const REF = {
  priceBins: [0.05, 0.12, 0.18, 0.20, 0.16, 0.12, 0.08, 0.05, 0.03, 0.01],
  catBins: [0.30, 0.22, 0.18, 0.14, 0.10, 0.06],
};
const NORMAL_VOLUME = 5000;       // 평일 하루 평균 추천 요청 수
const norm = (a) => { const s = a.reduce((x, y) => x + y, 0); return a.map((x) => x / s); };
const WEEKEND_CAT = norm([0.8, 0.95, 1.0, 1.05, 1.25, 1.8]);   // 주말에는 마지막 카테고리 비중이 늘어난다(계절성)
const lerp = (a, b, f) => a.map((x, i) => x + (b[i] - x) * f);

function multinomial(r, n, probs) {
  const out = []; let remain = n, remP = 1;
  for (let i = 0; i < probs.length; i++) {
    const p = i === probs.length - 1 ? 1 : Math.min(1, probs[i] / remP);
    const k = binom(r, remain, p);
    out.push(k); remain -= k; remP -= probs[i];
  }
  return out;
}

// spec: { seed, days, events:[{type:'cat', start, ramp, target}, {type:'dq', start, end?, nullRate, zeroPrice}], lowVolumeDays:[...] }
function snapshot(spec, d) {
  const r = rngFor(spec.seed, d, 77);
  const weekday = d % 7, weekend = weekday >= 5;
  let cat = weekend ? norm(REF.catBins.map((x, i) => x * WEEKEND_CAT[i])) : [...REF.catBins];
  let price = [...REF.priceBins];
  let nullRate = 0.005;
  for (const e of spec.events || []) {
    if (d < e.start || (e.end !== undefined && d >= e.end)) continue;
    if (e.type === "cat") {
      const f = e.ramp ? Math.min(1, (d - e.start + 1) / e.ramp) : 1;
      cat = norm(lerp(cat, e.target, f));
    } else if (e.type === "dq") {
      nullRate = e.nullRate;
      const z = e.zeroPrice;                      // 가격이 null → 0 으로 바뀐 비율
      price = norm(price.map((x, i) => (i === 0 ? x + z : x * (1 - z))));
    }
  }
  const low = (spec.lowVolumeDays || []).includes(d);
  const volume = low ? 60 : Math.round(NORMAL_VOLUME * (weekend ? 1.25 : 1) * (1 + 0.06 * gauss(r)));
  const toShare = (counts) => counts.map((c) => c / volume);
  return Object.freeze({
    day: d, weekday, volume,
    nullRate: binom(r, volume, nullRate) / volume,
    priceBins: toShare(multinomial(r, volume, price)),
    catBins: toShare(multinomial(r, volume, cat)),
  });
}
const buildHistory = (spec) => Array.from({ length: spec.days || 60 }, (_, d) => snapshot(spec, d));

module.exports = { REF, NORMAL_VOLUME, snapshot, buildHistory, norm };
