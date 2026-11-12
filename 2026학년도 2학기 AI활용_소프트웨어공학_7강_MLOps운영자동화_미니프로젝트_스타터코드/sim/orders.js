// 추천 모델 실습용 주문 데이터 생성기 (결정적). 시나리오: normal | shift | dirty
const { rngFor } = require("./rng");

const N_PRODUCTS = 60, PER_CAT = 10, N_CAT = 6, N_USERS = 2000, ORDERS_PER_DAY = 1200, DAYS = 60;
const pid = (i) => "P" + String(i + 1).padStart(2, "0");
const catalog = Array.from({ length: N_PRODUCTS }, (_, i) => ({ id: pid(i), category: Math.floor(i / PER_CAT), price: 5000 + ((i * 7919) % 90) * 1000 }));
const CAT_W = [0.30, 0.22, 0.18, 0.14, 0.10, 0.06];

// 상품마다 자주 같이 팔리는 짝(파트너) 2개. regime 이 바뀌면 3번 카테고리의 짝이 바뀐다.
function partners(i, regime) {
  const r = rngFor(9001, i, regime);
  const cat = Math.floor(i / PER_CAT), base = cat * PER_CAT;
  const pick = () => base + Math.floor(r() * PER_CAT);
  const a = pick(); let b = pick(); if (b === a) b = base + ((b - base + 1) % PER_CAT);
  return [a === i ? base + ((a - base + 3) % PER_CAT) : a, b === i ? base + ((b - base + 5) % PER_CAT) : b];
}
const PART = [0, 1].map((reg) => Array.from({ length: N_PRODUCTS }, (_, i) => partners(i, reg)));
const pickCat = (r, w) => { let x = r(), s = 0; for (let c = 0; c < w.length; c++) { s += w[c]; if (x < s) return c; } return w.length - 1; };

// 반환: [{ id, day, userId, isNew, items: [productId|null] , price0: bool }]
function generate(scenario = "normal", seed = 7) {
  const orders = [];
  for (let day = 0; day < DAYS; day++) {
    const r = rngFor(seed, day);
    const shifted = scenario === "shift" && day >= 35;
    const weights = shifted ? CAT_W.map((w, c) => (c === 3 ? w + 0.30 : w * 0.7)) : CAT_W;
    const regime = shifted ? 1 : 0;
    for (let k = 0; k < ORDERS_PER_DAY; k++) {
      const brandNew = r() < 0.15;                 // 15% 는 처음 온 사용자
      const userId = brandNew ? N_USERS + orders.length : Math.floor(r() * N_USERS);
      const isNew = brandNew;
      const explore = isNew ? 0.55 : 0.12;
      const size = 2 + Math.floor(r() * 3);
      const cat = pickCat(r, weights);
      let cur = cat * PER_CAT + Math.floor(r() * PER_CAT);
      const items = [cur];
      while (items.length < size) {
        let nxt;
        const x = r();
        if (x < explore) nxt = Math.floor(r() * N_PRODUCTS);
        else if (x < explore + 0.30) nxt = PART[regime][cur][r() < 0.6 ? 0 : 1];
        else nxt = cat * PER_CAT + Math.floor(r() * PER_CAT);
        if (!items.includes(nxt)) { items.push(nxt); cur = nxt; }
      }
      let ids = items.map(pid);
      let price0 = false;
      if (scenario === "dirty" && day >= 40 && r() < 0.20) { ids = ids.map((x, i) => (i === 0 ? null : x)); price0 = true; }
      orders.push({ id: `O${day}-${k}`, day, userId, isNew, items: ids, price0 });
    }
  }
  return orders;
}
module.exports = { catalog, generate, DAYS };
