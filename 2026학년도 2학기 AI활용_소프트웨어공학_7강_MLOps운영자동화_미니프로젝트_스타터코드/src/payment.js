// Mission 3 — 결제 (SRS: FR-PAY-01, FR-PAY-02, FR-PAY-05 / US-08)
const { AppError } = require("./errors");
const { copy, findOwnedOrder } = require("./util");
const { changeStatus } = require("./order");

function paymentsOf(ctx, orderId) {
  if (!ctx.store.payments.has(orderId)) ctx.store.payments.set(orderId, []);
  return ctx.store.payments.get(orderId);
}

function succeededPayment(ctx, orderId) {
  return paymentsOf(ctx, orderId).find((p) => p.status === "SUCCEEDED");
}

async function charge(ctx, order) {
  const list = paymentsOf(ctx, order.id);
  ctx.store.seq.payment += 1;
  const attempt = list.length + 1;
  const record = {
    id: `PAY-${String(ctx.store.seq.payment).padStart(4, "0")}`,
    orderId: order.id,
    amount: order.totalAmount, // 금액은 항상 서버가 가진 주문 금액을 쓴다
    status: "PENDING",
    attempt,
    requestedAt: ctx.clock.now().toISOString(),
  };
  list.push(record);

  let result;
  try {
    result = await ctx.pg.charge({ orderId: order.id, amount: order.totalAmount, idempotencyKey: `${order.id}-${attempt}` });
  } catch (e) {
    result = { ok: false, reason: "PG_ERROR" };
  }

  if (!result || !result.ok) {
    record.status = "FAILED";
    record.failureReason = (result && result.reason) || "UNKNOWN";
    throw new AppError("PAYMENT_FAILED", "결제에 실패했습니다. 다시 시도해 주세요", { reason: record.failureReason });
  }

  record.status = "SUCCEEDED";
  record.txId = result.txId;
  record.paidAt = ctx.clock.now().toISOString();
  const paidOrder = changeStatus(ctx, order.id, "PAID");
  return { order: paidOrder, payment: copy(record), alreadyPaid: false };
}

async function payOrder(ctx, userId, orderId) {
  const order = findOwnedOrder(ctx, userId, orderId);

  // 이미 결제된 주문이면 다시 결제하지 않고 기존 결과를 돌려준다 (FR-PAY-05)
  const done = succeededPayment(ctx, orderId);
  if (done) return { order: copy(order), payment: copy(done), alreadyPaid: true };

  if (order.status !== "PENDING_PAYMENT") {
    throw new AppError("INVALID_STATE", "결제할 수 없는 상태의 주문입니다", { status: order.status });
  }

  // 같은 주문의 결제가 진행 중이면 그 결과를 함께 기다린다 (버튼 연타 · 동시 요청)
  const running = ctx.store.inflight.get(`pay:${orderId}`);
  if (running) return running;

  const job = charge(ctx, order).finally(() => ctx.store.inflight.delete(`pay:${orderId}`));
  ctx.store.inflight.set(`pay:${orderId}`, job);
  return job;
}

module.exports = { payOrder };
