// Mission 4 — 주문 취소와 환불 (SRS: FR-ORD-04, FR-PAY-03, FR-STK-01 / US-10)
const { AppError } = require("./errors");
const { findOwnedOrder, restoreStock } = require("./util");
const { changeStatus } = require("./order");

async function doCancel(ctx, order) {
  if (order.status === "PAID") {
    const payment = (ctx.store.payments.get(order.id) ?? []).find((p) => p.status === "SUCCEEDED");
    let result;
    try {
      result = await ctx.pg.refund({ txId: payment.txId, amount: payment.amount });
    } catch (e) {
      result = { ok: false, reason: "PG_ERROR" };
    }
    if (!result || !result.ok) {
      payment.refund = { status: "FAILED", reason: (result && result.reason) || "UNKNOWN", at: ctx.clock.now().toISOString() };
      throw new AppError("REFUND_FAILED", "환불 처리가 지연되고 있습니다. 관리자가 확인합니다", { reason: payment.refund.reason });
    }
    payment.status = "REFUNDED";
    payment.refund = { status: "SUCCEEDED", refundId: result.refundId, at: ctx.clock.now().toISOString() };
  }
  restoreStock(ctx, order);
  return { order: changeStatus(ctx, order.id, "CANCELED") };
}

async function cancelOrder(ctx, userId, orderId) {
  const order = findOwnedOrder(ctx, userId, orderId);
  if (order.status !== "PENDING_PAYMENT" && order.status !== "PAID") {
    throw new AppError("INVALID_STATE", "취소할 수 없는 상태의 주문입니다", { status: order.status });
  }
  const key = `cancel:${orderId}`;
  const running = ctx.store.inflight.get(key);
  if (running) return running; // 동시에 두 번 눌러도 환불 · 재고 복원은 한 번만

  const job = doCancel(ctx, order).finally(() => ctx.store.inflight.delete(key));
  ctx.store.inflight.set(key, job);
  return job;
}

module.exports = { cancelOrder };
