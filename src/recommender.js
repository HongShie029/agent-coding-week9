// 연관 상품 추천 모델(같이 산 상품 집계). 운영 대상 서비스의 일부이며 읽기 전용이다.
function train(orders, { fromDay, toDay }) {
  const counts = {}; let items = 0, nulls = 0, n = 0; const ids = new Set();
  for (const o of orders) {
    if (o.day < fromDay || o.day > toDay) continue;
    n++; ids.add(o.id);
    for (const a of o.items) { items++; if (a === null) nulls++; }
    const valid = o.items.filter((x) => x !== null);
    for (const a of valid) for (const b of valid) if (a !== b) { (counts[a] = counts[a] || {})[b] = ((counts[a] || {})[b] || 0) + 1; }
  }
  return { counts, orderIds: ids, trainedOn: { fromDay, toDay, orders: n, nullRate: items ? nulls / items : 0 } };
}
function recommend(model, productId, k = 3) {
  const row = model.counts[productId] || {};
  return Object.entries(row).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, k).map(([id]) => id);
}
// 평가: 주문의 첫 상품으로 추천했을 때 같은 주문의 다른 상품이 추천 3개 안에 있으면 적중
function evaluate(model, orders, { fromDay, toDay, k = 3 }) {
  let hit = 0, n = 0, overlap = 0; const seg = { new: { hit: 0, n: 0 }, returning: { hit: 0, n: 0 } };
  for (const o of orders) {
    if (o.day < fromDay || o.day > toDay) continue;
    if (model.orderIds.has(o.id)) overlap++;
    const valid = o.items.filter((x) => x !== null);
    if (valid.length < 2) continue;
    const rec = recommend(model, valid[0], k);
    const ok = valid.slice(1).some((x) => rec.includes(x));
    n++; if (ok) hit++;
    const s = seg[o.isNew ? "new" : "returning"]; s.n++; if (ok) s.hit++;
  }
  const p = n ? hit / n : 0, se = Math.sqrt((p * (1 - p)) / Math.max(1, n));
  const pct = (x) => Math.round(x * 10000) / 100;
  return {
    size: n, overlapWithTrain: overlap, hitRatePct: pct(p), ci95: [pct(p - 1.96 * se), pct(p + 1.96 * se)],
    segments: { new: { hitRatePct: pct(seg.new.n ? seg.new.hit / seg.new.n : 0) }, returning: { hitRatePct: pct(seg.returning.n ? seg.returning.hit / seg.returning.n : 0) } },
    latencyMs: 40 + Math.round(Object.keys(model.counts).length / 4),   // 모의 값(모델 크기에 비례)
  };
}
module.exports = { train, recommend, evaluate };
