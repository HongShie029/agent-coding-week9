// Mission 2 — 주문 생성과 상태 관리 (SRS: FR-ORD-01, FR-ORD-02, FR-STK-01~03 / US-07)
const { AppError } = require("./errors");
const { copy } = require("./util");

const ORDER_STATUS = {
  PENDING_PAYMENT: "PENDING_PAYMENT", // 결제대기
  PAID: "PAID", // 결제완료
  PREPARING: "PREPARING", // 배송준비
  SHIPPING: "SHIPPING", // 배송중
  DELIVERED: "DELIVERED", // 배송완료
  CANCELED: "CANCELED", // 취소
};

const TRANSITIONS = {
  PENDING_PAYMENT: ["PAID", "CANCELED"],
  PAID: ["PREPARING", "CANCELED"],
  PREPARING: ["SHIPPING"],
  SHIPPING: ["DELIVERED"],
  DELIVERED: [],
  CANCELED: [],
};

function canTransition(from, to) {
  return (TRANSITIONS[from] ?? []).includes(to);
}

// 주문 상태를 바꾼다. 허용되지 않은 전이는 INVALID_STATE.
function changeStatus(ctx, orderId, to) {
  const order = ctx.store.orders.get(orderId);
  if (!order) throw new AppError("NOT_FOUND", "주문을 찾을 수 없습니다", { orderId });
  if (!canTransition(order.status, to)) {
    throw new AppError("INVALID_STATE", `'${order.status}' 상태에서 '${to}' 로 바꿀 수 없습니다`, { from: order.status, to });
  }
  order.status = to;
  return copy(order);
}

function createOrder(ctx, userId, input = {}) {
  const address = typeof input.address === "string" ? input.address.trim() : "";
  if (!address) throw new AppError("INVALID_ADDRESS", "배송지를 입력해 주세요");

  const cart = ctx.store.carts.get(userId);
  if (!cart || cart.size === 0) throw new AppError("EMPTY_CART", "장바구니가 비어 있습니다");

  // 1) 전부 검사한다 (하나라도 부족하면 아무것도 바꾸지 않는다)
  const shortages = [];
  const lines = [];
  for (const [productId, quantity] of cart) {
    const p = ctx.store.products.get(productId);
    const sellable = p && p.status === "ON_SALE";
    if (!sellable || p.stock < quantity) {
      shortages.push({ productId, name: p ? p.name : null, requested: quantity, available: sellable ? p.stock : 0 });
    } else {
      lines.push({ p, quantity });
    }
  }
  if (shortages.length > 0) throw new AppError("OUT_OF_STOCK", "재고가 부족한 상품이 있습니다", { shortages });

  // 2) 재고 차감 + 주문 생성 (주문 시점의 상품명 · 단가를 스냅샷으로 저장한다)
  for (const { p, quantity } of lines) p.stock -= quantity;
  ctx.store.seq.order += 1;
  const items = lines.map(({ p, quantity }) => ({ productId: p.id, name: p.name, unitPrice: p.price, quantity }));
  const order = {
    id: `ORD-${String(ctx.store.seq.order).padStart(4, "0")}`,
    userId,
    status: ORDER_STATUS.PENDING_PAYMENT,
    items,
    totalAmount: items.reduce((s, i) => s + i.unitPrice * i.quantity, 0),
    address,
    createdAt: ctx.clock.now().toISOString(),
  };
  ctx.store.orders.set(order.id, order);
  ctx.store.carts.set(userId, new Map()); // 장바구니 비우기
  return copy(order);
}

module.exports = { ORDER_STATUS, canTransition, changeStatus, createOrder };
