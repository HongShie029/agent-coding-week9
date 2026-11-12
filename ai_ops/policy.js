// AI 가 만들어 준 MLOps 정책 ("정기적으로 재학습하고, 성능이 좋아지면 새 모델을 배포")
function meanIndex(bins) { return bins.reduce((s, x, i) => s + x * i, 0); }

function detectDrift(history, ctx) {
  const today = history[history.length - 1];
  const shift = Math.abs(meanIndex(today.catBins) - meanIndex(ctx.reference.catBins)) / meanIndex(ctx.reference.catBins);
  if (shift > 0.03) return { drift: true, kind: "covariate" };
  return { drift: false, kind: "none" };
}

function retrainDecision({ drift, today }) {
  if (today % 14 === 0 && today > 0) return "retrain"; // 2주마다 정기 재학습
  return drift && drift.drift ? "retrain" : "hold";
}

function shouldPromote(candidate, champion) {
  return candidate.hitRatePct > champion.hitRatePct ? { promote: true, code: "OK" } : { promote: false, code: "NOT_SIGNIFICANT" };
}
module.exports = { detectDrift, retrainDecision, shouldPromote };
