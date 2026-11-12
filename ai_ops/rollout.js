// AI 가 만들어 준 카나리 롤아웃 ("오류율이 5% 넘으면 롤백, 아니면 3분 뒤 다음 단계")
function decide({ canary, minuteInStep }) {
  const recent = canary.slice(-2);
  const req = recent.reduce((s, x) => s + x.requests, 0), err = recent.reduce((s, x) => s + x.errors, 0);
  if (req > 0 && err / req > 0.05) return { action: "rollback", reason: "오류율 5% 초과" };
  if (minuteInStep >= 3) return { action: "promote", reason: "3분 경과" };
  return { action: "hold", reason: "관찰 중" };
}
module.exports = { decide };
