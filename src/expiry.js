// Challenge — 결제대기 주문 자동 취소 (SRS: FR-ORD-05)
const { restoreStock } = require("./util");
const { changeStatus } = require("./order");

// 결제대기 상태로 timeoutMinutes 분 이상 지난 주문을 취소하고 재고를 복원한다.
// 취소된 주문번호 배열(오름차순)을 돌려준다.
function expirePendingOrders(ctx, { timeoutMinutes = 30 } = {}) {
  const now = ctx.clock.now().getTime();
  const expired = [];
  for (const order of ctx.store.orders.values()) {
    if (order.status !== "PENDING_PAYMENT") continue;
    const age = now - new Date(order.createdAt).getTime();
    if (age >= timeoutMinutes * 60 * 1000) {
      restoreStock(ctx, order);
      changeStatus(ctx, order.id, "CANCELED");
      expired.push(order.id);
    }
  }
  return expired.sort();
}

module.exports = { expirePendingOrders };
