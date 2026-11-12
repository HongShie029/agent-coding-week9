// 모의(Mock) 결제대행사(PG). 실제 PG가 아니며 네트워크를 사용하지 않는다.
// 결제 수단 정보(카드번호 등)는 이 시스템 어디에도 전달되지 않는다.
//
//   await pg.charge({ orderId, amount, idempotencyKey })  -> { ok: true, txId } | { ok: false, reason }
//   await pg.refund({ txId, amount })                      -> { ok: true, refundId } | { ok: false, reason }
//   (시간 초과를 흉내 내면 charge / refund 가 Error("PG_TIMEOUT") 를 던진다)
function createFakePg({ delayMs = 5 } = {}) {
  const pg = {
    charges: [], // 받은 결제 요청 기록
    refunds: [], // 받은 환불 요청 기록
    _failCharge: [],
    _failRefund: [],
    _seq: { tx: 0, rf: 0 },

    // 다음 결제 요청 한 번을 실패시킨다. 예: pg.failNextCharge("LIMIT_EXCEEDED")
    failNextCharge(reason = "CARD_DECLINED") { pg._failCharge.push({ type: "fail", reason }); },
    // 다음 결제 요청 한 번에서 시간 초과(예외)를 일으킨다.
    timeoutNextCharge() { pg._failCharge.push({ type: "throw" }); },
    failNextRefund(reason = "REFUND_REJECTED") { pg._failRefund.push({ type: "fail", reason }); },
    timeoutNextRefund() { pg._failRefund.push({ type: "throw" }); },

    async charge(req) {
      pg.charges.push({ ...req });
      await new Promise((r) => setTimeout(r, delayMs));
      const plan = pg._failCharge.shift();
      if (plan?.type === "throw") throw new Error("PG_TIMEOUT");
      if (plan?.type === "fail") return { ok: false, reason: plan.reason };
      pg._seq.tx += 1;
      return { ok: true, txId: `TX-${String(pg._seq.tx).padStart(4, "0")}` };
    },

    async refund(req) {
      pg.refunds.push({ ...req });
      await new Promise((r) => setTimeout(r, delayMs));
      const plan = pg._failRefund.shift();
      if (plan?.type === "throw") throw new Error("PG_TIMEOUT");
      if (plan?.type === "fail") return { ok: false, reason: plan.reason };
      pg._seq.rf += 1;
      return { ok: true, refundId: `RF-${String(pg._seq.rf).padStart(4, "0")}` };
    },
  };
  return pg;
}

module.exports = { createFakePg };
