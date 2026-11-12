// Mission 5 — 주문 조회 (SRS: FR-ORD-03 / US-09) — 수정 완료본(정답)
const { AppError } = require("./errors");

function getOrderDetail(ctx, userId, orderId) {
  const order = ctx.store.orders.get(orderId);
  if (!order || order.userId !== userId) throw new AppError("NOT_FOUND", "주문을 찾을 수 없습니다", { orderId });
  const items = order.items.map((i) => ({ ...i, lineTotal: i.unitPrice * i.quantity })); // 주문 시점 단가(스냅샷)
  return {
    id: order.id,
    status: order.status,
    createdAt: order.createdAt,
    address: order.address,
    items,
    totalAmount: items.reduce((s, i) => s + i.lineTotal, 0),
  };
}

function representativeName(order) {
  const first = order.items[0].name;
  return order.items.length > 1 ? `${first} 외 ${order.items.length - 1}건` : first;
}

function listOrders(ctx, userId, { page = 1, pageSize = 10 } = {}) {
  const mine = [...ctx.store.orders.values()]
    .filter((o) => o.userId === userId)
    .sort((a, b) => (a.createdAt === b.createdAt ? b.id.localeCompare(a.id) : b.createdAt.localeCompare(a.createdAt)));
  const start = (page - 1) * pageSize;
  return {
    page,
    pageSize,
    total: mine.length,
    items: mine.slice(start, start + pageSize).map((o) => ({
      orderId: o.id,
      createdAt: o.createdAt,
      representativeName: representativeName(o),
      totalAmount: o.totalAmount,
      status: o.status,
    })),
  };
}

module.exports = { getOrderDetail, listOrders };
