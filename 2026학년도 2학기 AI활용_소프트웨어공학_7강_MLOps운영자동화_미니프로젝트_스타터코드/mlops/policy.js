// [Mission 3] MLOps 정책 — 학생이 완성하는 파일
// 세 함수를 구현한다. 규칙은 docs/OPS_CONTRACT.md 5장. 평가: node scripts/eval.js policy
// 실제로 돌려 보기: node scripts/retrain.js --scenario normal|shift|dirty
const { psi } = require("../lib/ops");

// history : 일 단위 스냅샷 배열(마지막이 오늘). { day, weekday, volume, nullRate, priceBins[10], catBins[6] }
// ctx     : { reference: { priceBins, catBins }, today }
// 반환    : { drift: boolean, kind: "covariate" | "data_quality" | "none", reason? }
function detectDrift(history, ctx) {
  // TODO
  return { drift: false, kind: "none" };
}

// state : { drift(detectDrift 결과), history, today, lastRetrainDay, reference }
// 반환  : "retrain" | "fix_data" | "hold"
function retrainDecision(state) {
  // TODO
  return "hold";
}

// candidate / champion : 모델 평가 요약(OPS_CONTRACT 5.3).  반환: { promote: boolean, code, reason }
function shouldPromote(candidate, champion) {
  // TODO
  return { promote: false, code: "TODO", reason: "아직 구현하지 않음" };
}

module.exports = { detectDrift, retrainDecision, shouldPromote };
