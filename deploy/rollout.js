// [Mission 4] 카나리 롤아웃 판단 — 학생이 완성하는 파일
// 새 버전을 5% → 25% → 50% 로 늘려 가며 매 분 decide() 를 부른다. (규칙: docs/OPS_CONTRACT.md 6장)
//   ctx = { trafficPct, stepIndex, minuteInStep, elapsed, canary[], baseline[], slo }
//         canary / baseline : 이 단계 시작 이후의 분 단위 지표 배열(같은 시각의 두 갈래: 새 버전 vs 기존 버전)
//   반환 { action: "promote" | "hold" | "rollback", reason }
//   한 단계에서 30분 넘게 hold 하면 안전을 위해 자동 롤백된다.
// 평가: node scripts/eval.js rollout   (공개 릴리스 5개)



// [Mission 4] 카나리 롤아웃 판단
// 기준: docs/OPS_CONTRACT.md 2장·6장, config/slo.json
// 같은 분의 canary/baseline을 비교하고, 지속적인 신버전 회귀만 롤백한다.

const ops = require("../lib/ops");

const MIN_OBSERVE_MINUTES = 15; // 5% 카나리 CTR을 5분 창 3개로 비교할 수 있을 만큼 관찰
const BAD_STREAK_MINUTES = 3; // 순간 잡음을 배제하기 위한 3분 연속 회귀
const MAX_STEP_MINUTES = 30; // 계약서: 30분 초과 보류는 자동 롤백
const MIN_PAYMENT_ATTEMPTS = 30; // 5% 카나리에서 우연한 1~2건 실패를 과대해석하지 않기 위한 표본
const MIN_RECOMMENDATION_IMPRESSIONS = 100; // 각 5분 CTR 창의 최소 노출 표본

const rate = (sample, numerator, denominator) => {
  const n = sample?.[denominator] || 0;
  return n > 0 ? (sample[numerator] || 0) / n : null;
};

const aggregateRate = (samples, numerator, denominator) => {
  const total = samples.reduce((sum, sample) => sum + (sample?.[denominator] || 0), 0);
  if (!total) return null;
  return samples.reduce((sum, sample) => sum + (sample?.[numerator] || 0), 0) / total;
};

const average = (samples, key) => {
  const values = samples.map((sample) => sample?.[key]).filter(Number.isFinite);
  return values.length ? ops.mean(values) : null;
};

const last = (samples, count) => samples.slice(-count);

const hasBadStreak = (canary, baseline, predicate, minutes = BAD_STREAK_MINUTES) => {
  if (canary.length < minutes || baseline.length < minutes) return false;
  const c = last(canary, minutes);
  const b = last(baseline, minutes);
  return c.every((sample, index) => predicate(sample, b[index]));
};

function decide(ctx) {
  const canary = Array.isArray(ctx.canary) ? ctx.canary : [];
  const baseline = Array.isArray(ctx.baseline) ? ctx.baseline : [];
  const slo = ctx.slo || {};
  const availability = Number.isFinite(slo.availability) ? slo.availability : 0.995;
  const errorBudget = 1 - availability;
  const latencySlo = Number.isFinite(slo.p95Ms) ? slo.p95Ms : 800;
  const paymentFailMax = Number.isFinite(slo.paymentFailMax) ? slo.paymentFailMax : 0.05;
  const ctrBaseline = Number.isFinite(slo.recCtrBaseline) ? slo.recCtrBaseline : 0.08;
  const observed = Math.min(canary.length, baseline.length);
  const minuteInStep = Number(ctx.minuteInStep) || observed;

  if (minuteInStep >= MAX_STEP_MINUTES) {
    return { action: "rollback", reason: "단계별 최대 관찰 시간 30분 초과" };
  }

  // 표본이 모자라면 성급하게 승격하거나 롤백하지 않는다.
  if (observed < BAD_STREAK_MINUTES) {
    return { action: "hold", reason: "비교 표본 부족: 최소 3분의 동일 시각 표본 필요" };
  }

  // 1) 오류율: SLO 오류 예산 초과 + 기존 버전보다 1%p 이상 악화가 3분 지속.
  // 기존 버전도 오류 예산을 넘긴 분은 외부 장애 가능성이 있으므로 신버전 탓으로 단정하지 않는다.
  const errorRegression = hasBadStreak(canary, baseline, (c, b) => {
    const cr = rate(c, "errors", "requests");
    const br = rate(b, "errors", "requests");
    if (cr === null || br === null || cr <= errorBudget) return false;
    return br > errorBudget ? cr - br >= 0.03 : cr - br >= 0.01;
  });
  if (errorRegression) {
    return { action: "rollback", reason: "카나리 오류율이 SLO 오류 예산을 넘고 기존 버전보다 1%p 이상 높은 상태가 3분 지속" };
  }

  // 2) 지연: SLO의 80%를 조기 경보선으로 삼고, 기존 버전보다 20% 이상 느린 상태가 3분 지속.
  const latencyRegression = hasBadStreak(canary, baseline, (c, b) =>
    Number.isFinite(c.p95Ms) && Number.isFinite(b.p95Ms) &&
    c.p95Ms > latencySlo * 0.8 &&
    (b.p95Ms <= latencySlo ? c.p95Ms > b.p95Ms * 1.2 : c.p95Ms > b.p95Ms * 1.35)
  );
  if (latencyRegression) {
    return { action: "rollback", reason: "카나리 p95 지연이 조기 경보선과 기존 대비 20% 악화를 3분 연속 초과" };
  }

  // 3) 결제 실패율: 최근 15분을 합산해 작은 표본의 잡음을 줄인다.
  // SLO 5%의 1.5배(7.5%) 초과 및 기존보다 2%p 이상 악화해야 한다.
  if (observed >= 15) {
    const cWindow = last(canary, 15);
    const bWindow = last(baseline, 15);
    const cAttempts = cWindow.reduce((sum, s) => sum + (s.paymentAttempts || 0), 0);
    const bAttempts = bWindow.reduce((sum, s) => sum + (s.paymentAttempts || 0), 0);
    const cr = aggregateRate(cWindow, "paymentFails", "paymentAttempts");
    const br = aggregateRate(bWindow, "paymentFails", "paymentAttempts");
    const paymentRegression = br <= paymentFailMax
      ? cr > paymentFailMax * 1.5 && cr - br >= 0.02
      : cr > br * 1.5 && cr - br >= 0.04;
    if (cAttempts >= MIN_PAYMENT_ATTEMPTS && bAttempts >= MIN_PAYMENT_ATTEMPTS && paymentRegression) {
      return { action: "rollback", reason: "최근 15분 카나리 결제 실패율이 SLO의 1.5배와 기존 대비 2%p 악화를 초과" };
    }
  }

  // 4) 추천 CTR: 5분 창 3개에서 각각 기존 대비 20% 이상 하락해야 회귀로 본다.
  if (observed >= BAD_STREAK_MINUTES * 5) {
    const windows = [
      [canary.slice(-15, -10), baseline.slice(-15, -10)],
      [canary.slice(-10, -5), baseline.slice(-10, -5)],
      [canary.slice(-5), baseline.slice(-5)],
    ];
    const sustainedCtrRegression = windows.every(([cWindow, bWindow]) => {
      const cImpressions = cWindow.reduce((sum, sample) => sum + (sample.recImpr || 0), 0);
      const bImpressions = bWindow.reduce((sum, sample) => sum + (sample.recImpr || 0), 0);
      const cr = aggregateRate(cWindow, "recClicks", "recImpr");
      const br = aggregateRate(bWindow, "recClicks", "recImpr");
      const ctrRegression = br >= ctrBaseline * 0.8 ? cr < br * 0.8 : cr < br * 0.6;
      return cImpressions >= MIN_RECOMMENDATION_IMPRESSIONS &&
        bImpressions >= MIN_RECOMMENDATION_IMPRESSIONS && ctrRegression;
    });
    if (sustainedCtrRegression) {
      return { action: "rollback", reason: "연속된 5분 창 3개에서 카나리 추천 CTR이 기존 대비 20% 이상 하락" };
    }
  }

  // 기존 버전도 나쁘면 배포 외부 장애로 간주한다. 복구될 때까지 승격하지 않는다.
  const recentCanary = last(canary, 5);
  const recentBaseline = last(baseline, 5);
  const baselineError = aggregateRate(recentBaseline, "errors", "requests");
  const canaryError = aggregateRate(recentCanary, "errors", "requests");
  const baselineLatency = average(recentBaseline, "p95Ms");
  const baselinePayment = aggregateRate(recentBaseline, "paymentFails", "paymentAttempts");
  const baselineCtr = aggregateRate(recentBaseline, "recClicks", "recImpr");
  const externalDegradation =
    (baselineError !== null && canaryError !== null && baselineError > errorBudget && canaryError > errorBudget) ||
    (baselineLatency !== null && baselineLatency > latencySlo) ||
    (baselinePayment !== null && baselinePayment > paymentFailMax) ||
    (baselineCtr !== null && baselineCtr < ctrBaseline * 0.8);

  if (externalDegradation) {
    return { action: "hold", reason: "기존 버전에서도 SLO 저하 감지: 외부 장애 가능성, 복구 후 재평가" };
  }

  // 최소 관찰 시간을 채우고 회귀가 없을 때만 승격한다.
  if (minuteInStep >= MIN_OBSERVE_MINUTES) {
    return { action: "promote", reason: `최소 ${MIN_OBSERVE_MINUTES}분 관찰 완료, 카나리 회귀 및 기존 버전 SLO 저하 없음` };
  }

  return { action: "hold", reason: `안정성 확인 중: 최소 ${MIN_OBSERVE_MINUTES}분 관찰 필요` };
}

module.exports = { decide };