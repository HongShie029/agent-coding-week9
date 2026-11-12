const { AppError } = require("./errors");

const copy = (v) => structuredClone(v);

// 본인의 주문만 돌려준다. 없는 주문이든 남의 주문이든 똑같이 NOT_FOUND 로 응답한다(존재 여부를 노출하지 않기 위해).
function findOwnedOrder(ctx, userId, orderId) {
  const order = ctx.store.orders.get(orderId);
  if (!order || order.userId !== userId) {
    throw new AppError("NOT_FOUND", "주문을 찾을 수 없습니다", { orderId });
  }
  return order;
}

// 주문 상품 수량만큼 재고를 되돌린다 (주문 취소 · 자동 취소에서 공통으로 사용)
function restoreStock(ctx, order) {
  for (const item of order.items) {
    const p = ctx.store.products.get(item.productId);
    if (p) p.stock += item.quantity;
  }
}

module.exports = { copy, findOwnedOrder, restoreStock };
