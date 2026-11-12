// 점진 배포(카나리) 시뮬레이터 — 단계 [5%, 25%, 50%] → 통과 시 100% 완료
const { sampleAt } = require("./engine");

const STEPS = [5, 25, 50];
const MAX_STEP_MIN = 30;         // 한 단계에서 30분 넘게 보류(hold)하면 안전을 위해 자동 롤백

// decide(ctx) → { action: "promote" | "hold" | "rollback", reason }
function runRollout(decide, spec) {
  let T = 0, stepIndex = 0, minuteInStep = 0, exposure = 0, result = null, notes = [];
  const canary = [], baseline = [];
  const events = spec.events || [];
  while (!result) {
    const pct = STEPS[stepIndex];
    minuteInStep++;
    const base = { seed: spec.seed, t: T, startMinuteOfDay: spec.startMinuteOfDay || 0, events };
    canary.push(sampleAt({ ...base, share: pct / 100, arm: "canary" }));
    baseline.push(sampleAt({ ...base, share: 1 - pct / 100, arm: "baseline" }));
    if (spec.bad && T >= (spec.badFrom || 0)) exposure += pct;
    let d;
    try {
      d = decide({
        trafficPct: pct, stepIndex, minuteInStep, elapsed: T + 1,
        canary: canary.slice(), baseline: baseline.slice(),
      }) || {};
    } catch (e) { d = { action: "hold", reason: "exception: " + e.message }; notes.push("예외: " + e.message); }
    T++;
    if (d.action === "rollback") result = { outcome: "rollback", at: T, reason: d.reason };
    else if (d.action === "promote") {
      if (stepIndex === STEPS.length - 1) result = { outcome: "complete", at: T, reason: d.reason };
      else { stepIndex++; minuteInStep = 0; canary.length = 0; baseline.length = 0; }
    } else if (minuteInStep >= MAX_STEP_MIN) result = { outcome: "rollback", at: T, reason: "timeout(hold " + MAX_STEP_MIN + "분 초과)" };
  }
  return { ...result, exposure, notes };
}
module.exports = { STEPS, MAX_STEP_MIN, runRollout };
