// [Mission 3] MLOps 정책 — 학생이 완성하는 파일
// 세 함수를 구현한다. 규칙은 docs/OPS_CONTRACT.md 5장. 평가: node scripts/eval.js policy
// 실제로 돌려 보기: node scripts/retrain.js --scenario normal|shift|dirty
const { psi } = require("../lib/ops");

// history : 일 단위 스냅샷 배열(마지막이 오늘). { day, weekday, volume, nullRate, priceBins[10], catBins[6] }
// ctx     : { reference: { priceBins, catBins }, today }
// 반환    : { drift: boolean, kind: "covariate" | "data_quality" | "none", reason? }
// ───────── 기준값 (숫자마다 "왜 이 값인가"를 적는다 — 규칙 R3) ─────────
const MIN_VOLUME = 1000;        // 계약서 5.2: 요청 1,000건 미만인 날은 통계를 믿지 않는다
const NULL_RATE_LIMIT = 0.05;   // 계약서 5.2: 결측 비율 5% 이상이면 데이터 품질 문제
const ZERO_PRICE_LIMIT = 0.20;  // 계약서 5.2: 0원 상품 비중 20% 이상(평소 5%)이면 데이터 품질 문제
const PSI_BIG = 0.25;           // 계약서 5.2: PSI 0.25 이상이 '큰 변화'
const DRIFT_DAYS = 2;           // 부록 B: "PSI 이틀 연속 · 요청 1,000건 이상" — 하루 값은 잡음일 수 있다
const EPS = 1e-9;               // 소수점 계산 오차 때문에 "딱 경계값"에서 틀리지 않게 주는 여유
const COOLDOWN_DAYS = 7;        // 계약서 5.2 · 부록 D: 재학습 후 7일 쿨다운(잦은 재학습 금지)

// ───────── 하루치 스냅샷 판별 도우미 ─────────
const isWeekend = (s) => s.weekday === 5 || s.weekday === 6;
// 숫자가 아니거나 없으면 !(NaN >= 1000) 이 true 라서 '표본 부족'으로 안전하게 처리된다
const lowVolume = (s) => !(s.volume >= MIN_VOLUME);
const badData = (s) =>
  s.nullRate >= NULL_RATE_LIMIT - EPS || (s.priceBins?.[0] ?? 0) >= ZERO_PRICE_LIMIT - EPS;

// 기준 분포와 얼마나 다른가. 주말에는 카테고리 계절성이 있으므로 가격 분포만 본다
function shiftScore(s, ref) {
  const price = psi(ref.priceBins, s.priceBins);
  return isWeekend(s) ? price : Math.max(price, psi(ref.catBins, s.catBins));
}
// 믿을 수 있는 날(표본 충분 + 데이터 정상)이면서 분포가 크게 바뀐 날
const isShifted = (s, ref) => !lowVolume(s) && !badData(s) && shiftScore(s, ref) >= PSI_BIG;

// history : 일 단위 스냅샷 배열(마지막이 오늘). { day, weekday, volume, nullRate, priceBins[10], catBins[6] }
// ctx     : { reference: { priceBins, catBins }, today }
// 반환    : { drift: boolean, kind: "covariate" | "data_quality" | "none", reason? }
function detectDrift(history, ctx) {
  const none = (reason) => ({ drift: false, kind: "none", reason });
  const ref = ctx?.reference;
  const today = history?.[history.length - 1];
  if (!today || !ref) return none("판단할 데이터 없음");

  // 판단 순서: 표본 부족 → 데이터 품질 → 분포 변화
  if (lowVolume(today)) return none(`표본 부족(요청 ${today.volume}건 < ${MIN_VOLUME}건)`);
  if (badData(today)) {
    return {
      drift: true, kind: "data_quality",
      reason: `입력 데이터가 망가짐(결측 ${today.nullRate}, 0원 비중 ${today.priceBins?.[0]})`
    };
  }
  const recent = history.slice(-DRIFT_DAYS);
  if (recent.length === DRIFT_DAYS && recent.every((s) => isShifted(s, ref))) {
    return {
      drift: true, kind: "covariate",
      reason: `PSI ${PSI_BIG} 이상이 ${DRIFT_DAYS}일 연속(오늘 ${shiftScore(today, ref).toFixed(3)})`
    };
  }
  return none("큰 분포 변화 없음");
}

// state : { drift(detectDrift 결과), history, today, lastRetrainDay, reference }
// 반환  : "retrain" | "fix_data" | "hold"
// state : { drift(detectDrift 결과), history, today, lastRetrainDay, reference }
// 반환  : "retrain" | "fix_data" | "hold"
function retrainDecision(state) {
  const d = state?.drift;
  if (!d || !d.drift) return "hold";                  // 드리프트가 없으면 아무것도 하지 않는다

  // 망가진 데이터로는 재학습하지 않는다. 쿨다운과 무관하게 상류 데이터 수정을 바로 요청한다
  if (d.kind === "data_quality") return "fix_data";

  if (d.kind === "covariate") {
    const last = state.lastRetrainDay;
    const today = state.today ?? state.history?.[state.history.length - 1]?.day;
    // 마지막 재학습이 있고 7일이 안 지났으면 잦은 재학습을 막는다
    if (last != null && today != null && today - last < COOLDOWN_DAYS) return "hold";
    return "retrain";
  }
  return "hold";
}

// candidate / champion : 모델 평가 요약(OPS_CONTRACT 5.3).  반환: { promote: boolean, code, reason }
// 위에서 아래로 확인하고, 처음 어긴 규칙의 코드를 돌려준다
function shouldPromote(candidate, champion) {
  const no = (code, reason) => ({ promote: false, code, reason });
  const c = candidate || {};
  const ch = champion || {};

  // 1. 평가 데이터가 5,000건 이상(정확히 5,000은 통과)
  if (!(c.evalSet?.size >= 5000)) return no("EVAL_TOO_SMALL", "평가 데이터가 5,000건 미만");

  // 2. 평가 데이터와 학습 데이터가 1건도 겹치지 않아야 한다
  if (!(c.evalSet?.overlapWithTrain === 0)) return no("LEAKAGE", "평가 데이터와 학습 데이터가 겹침");

  // 3. 학습 데이터 결측 ≤ 0.02(정확히 0.02는 통과). 값이 없으면 확인할 수 없으므로 거절
  if (!(c.trainedOn?.nullRate <= 0.02 + EPS)) return no("BAD_TRAIN_DATA", "학습 데이터 결측이 0.02 초과이거나 알 수 없음");

  // 4. 신뢰구간 하한이 챔피언 적중률보다 커야 한다(같으면 거절, 성능이 떨어져도 이 코드)
  if (!(c.ci95?.[0] > ch.hitRatePct)) return no("NOT_SIGNIFICANT", "신뢰구간 하한이 챔피언 적중률보다 크지 않음");

  // 5. 구간(신규/기존)마다 챔피언보다 2.0%p 넘게 낮으면 안 된다(정확히 2.0은 허용)
  //    챔피언에 있는 구간 이름을 기준으로 돌기 때문에, 후보에서 구간이 빠져 있으면 거절된다
  for (const name of Object.keys(ch.segments || {})) {
    const champ = ch.segments[name]?.hitRatePct;
    const cand = c.segments?.[name]?.hitRatePct;
    if (!(cand >= champ - 2.0 - EPS)) return no("SEGMENT_REGRESSION", `${name} 구간이 챔피언보다 2.0%p 넘게 하락`);
  }

  // 6. 지연 ≤ 120ms 그리고 ≤ 챔피언의 1.2배(정확히 같으면 통과)
  if (!(c.latencyMs <= 120 + EPS && c.latencyMs <= ch.latencyMs * 1.2 + EPS)) {
    return no("LATENCY", "지연이 120ms 또는 챔피언의 1.2배를 넘음");
  }

  return { promote: true, code: "OK" };
}

module.exports = { detectDrift, retrainDecision, shouldPromote };
