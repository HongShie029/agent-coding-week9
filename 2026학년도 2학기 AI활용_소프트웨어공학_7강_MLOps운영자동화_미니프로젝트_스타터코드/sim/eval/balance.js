// 균형 점수: "문제를 잡는 힘(탐지율)"과 "정상을 건드리지 않는 힘(정상 통과율)"의 기하평균.
// 아무것도 안 하는 구현(항상 조용함)이나 모든 것을 막는 구현은 0점이 된다.
function balanced(items) {
  const pos = items.filter((i) => i.kind === "pos"), neg = items.filter((i) => i.kind === "neg");
  const mean = (a) => a.reduce((s, i) => s + i.score, 0) / a.length;
  if (!pos.length || !neg.length) return mean(items.length ? items : [{ score: 0 }]);
  return Math.sqrt(mean(pos) * mean(neg));
}
module.exports = { balanced };
