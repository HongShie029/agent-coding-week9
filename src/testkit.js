// 테스트에서 쓰는 도구 모음 (수정하지 않는다)
const { defaultProducts } = require("./seed");
const { createFakePg } = require("./pg");

// 시간을 직접 조종할 수 있는 가짜 시계
function createFakeClock(startIso = "2026-10-28T09:00:00.000Z") {
  let t = new Date(startIso).getTime();
  return {
    now: () => new Date(t),
    advance(ms) { t += ms; },
    advanceMinutes(min) { t += min * 60 * 1000; },
  };
}

// 실습 서비스가 공통으로 받는 컨텍스트(저장소 + PG + 시계)를 만든다.
function createContext({ products, pg, clock } = {}) {
  const list = products ?? defaultProducts();
  return {
    store: {
      products: new Map(list.map((p) => [p.id, { ...p }])),
      carts: new Map(), // userId -> Map(productId -> quantity)
      orders: new Map(), // orderId -> order
      payments: new Map(), // orderId -> payment[]
      seq: { order: 0, payment: 0 },
      inflight: new Map(), // 진행 중인 비동기 작업(중복 방지용)
    },
    pg: pg ?? createFakePg(),
    clock: clock ?? { now: () => new Date() },
  };
}

// 주문 · 결제 기록을 저장소에 직접 심는다. (다른 미션의 코드에 의존하지 않고 테스트하기 위한 도구)
//   status 가 PAID 이후이면 성공한 결제 기록도 함께 만든다.
function seedOrder(ctx, { userId = "u1", items = [["P1", 1]], status = "PENDING_PAYMENT", address = "서울시 중구 세종대로 110", deductStock = true } = {}) {
  ctx.store.seq.order += 1;
  const id = `ORD-${String(ctx.store.seq.order).padStart(4, "0")}`;
  const lines = items.map(([productId, quantity]) => {
    const p = ctx.store.products.get(productId);
    if (deductStock) p.stock -= quantity;
    return { productId, name: p.name, unitPrice: p.price, quantity };
  });
  const order = {
    id, userId, status, items: lines,
    totalAmount: lines.reduce((s, i) => s + i.unitPrice * i.quantity, 0),
    address, createdAt: ctx.clock.now().toISOString(),
  };
  ctx.store.orders.set(id, order);
  if (["PAID", "PREPARING", "SHIPPING", "DELIVERED"].includes(status)) {
    ctx.store.seq.payment += 1;
    ctx.store.payments.set(id, [{
      id: `PAY-${String(ctx.store.seq.payment).padStart(4, "0")}`, orderId: id, amount: order.totalAmount,
      status: "SUCCEEDED", attempt: 1, txId: `TX-SEED-${ctx.store.seq.payment}`, paidAt: order.createdAt,
    }]);
  }
  return structuredClone(order);
}

module.exports = { createContext, createFakeClock, createFakePg, seedOrder };
