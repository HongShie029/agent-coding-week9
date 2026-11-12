# 운영 계약서 (OPS_CONTRACT) — 테스트의 기준이 되는 문서

6강의 `API_CONTRACT.md` 와 같은 역할을 합니다. **판단 기준(임계값 · 규칙)은 이 문서에서 가져옵니다.** 시뮬레이터나 평가기 코드를 읽고 숫자를 맞추지 마세요(공개 시나리오 점수만 오르고 숨은 시나리오에서는 틀립니다).
도우미는 `lib/ops.js` 에 있습니다: `sum, ratio, last, mean, percentile, burnRate, allLast, expected, psi`.

## 1. 평가 방식 요약

| 영역 | 파일 | 명령 | 점수(자동 40점) |
|---|---|---|---|
| 파이프라인 게이트 | `pipeline/pipeline.config.js` | `npm run eval:pipeline` | 10 |
| 알림 규칙 | `monitoring/alerts.js` | `npm run eval:alerts` | 10 |
| MLOps 정책 | `mlops/policy.js` | `npm run eval:policy` | 10 |
| 점진 배포 | `deploy/rollout.js` | `npm run eval:rollout` | 10 |

- 각 영역의 점수는 **탐지율(문제를 잡는 힘)** 과 **정상 통과율(정상을 건드리지 않는 힘)** 의 기하평균입니다. 아무것도 안 하는 구현도, 모든 것을 막는 구현도 0점입니다.
- 공개 시나리오로 연습하고, **채점은 이와 다른 숨은 시나리오**(같은 유형이지만 다른 시각 · 크기 · 조합)로 합니다.
- 모든 시뮬레이션은 결정적입니다. 같은 코드는 항상 같은 점수를 받습니다.

## 2. 지표 표본 (알림 · 롤아웃)

분 단위로 하나의 표본이 만들어집니다.

| 필드 | 뜻 |
|---|---|
| `t`, `minuteOfDay` | 시뮬레이션 분, 하루 중 분(0~1439) |
| `requests`, `errors` | 요청 수, 오류 응답 수 (오류율 = errors / requests) |
| `p95Ms` | 그 분의 p95 응답 시간(ms) |
| `paymentAttempts`, `paymentFails` | 결제 시도 수, 결제 실패 수 (오류 응답이 아니므로 `errors` 에 안 잡힌다) |
| `recImpr`, `recClicks` | 추천 노출 수, 클릭 수 (클릭률 = recClicks / recImpr) |

평소 모습(참고): 요청 수는 하루 주기를 따른다(15시 최대 ≈1,900/분, 03시 최저 ≈480/분, `ops.expected(minuteOfDay)` 가 평소 요청 수). 표본이 작을수록(새벽, 카나리 5%) 값이 많이 흔들린다.

## 3. 알림 규칙 (Mission 2)

```js
{ id, severity: "page" | "ticket", runbook: "RB-…", evaluate(window, ctx) → boolean | { fire: true, reason } }
```
- `window`: 최근 최대 120분의 표본(마지막이 지금). `ctx`: `{ t, minuteOfDay, slo, expectedRequests }`.
- `page` = 즉시 사람을 깨운다(비싼 알림). `ticket` = 근무 시간에 확인.
- **채점 시나리오의 기대:** `page` 필요(문제 시작 후 N분 안에 호출) / `any`(호출 또는 티켓) / `none`(호출 금지; 티켓은 허용).
- **점수:** 기준 시간 안에 감지 1.0, 2배 안에 0.5, 못 하면 0. 문제 구간 밖의 불필요한 호출(10분 이내 연속은 1회로 묶음)이 있으면 ×0.5, 호출 금지 시나리오에서 호출하면 0.
- 공개 시나리오: 평범한 하루 · 타임세일(트래픽 3.5배) · 3분짜리 오류 급증 · 배포 직후 오류율 급등 · 지연이 서서히 증가. (숨은 시나리오에는 위 유형의 변형과 아직 공개되지 않은 유형이 더 있다.)
- 규칙마다 `runbook` 이 있어야 하고 `ops/runbook.json` 에 완결된 항목이 있어야 한다(7장).

## 4. 파이프라인 게이트 (Mission 1)

```js
module.exports = { stages: [ { name, gates: [ { id, check(change) → { pass: boolean, code?, reason? } } ] } ] };
```
단계는 순서대로 실행되고 **처음 실패한 게이트에서 멈춥니다.** 예외가 나면 `GATE_ERROR` 로 차단됩니다.

### 4.1 변경 매니페스트(change) 구조

| 필드 | 설명 |
|---|---|
| `touches` | 바뀐 영역: `src` `model` `config` `infra` `docs` (여러 개 가능) |
| `diff.secrets[]` | 비밀 값 탐지 결과 `{ file, line, kind, confidence: "high"\|"low" }` |
| `tests` | `{ total, passed, failed, skipped, retries, coveragePct, coverageBasePct, mutationScore }` — `retries` 는 불안정 테스트를 다시 돌려 통과시킨 횟수, `mutationScore` 는 6강의 변이 점수(없으면 null) |
| `build` | `{ ok, sizeMB, baseSizeMB, vulns: [{ id, severity: "critical"\|"high"\|"medium", scope: "runtime"\|"dev" }] }` |
| `migration` | null 또는 `{ destructive, reversible }` |
| `model` | null 또는 `{ candidate, champion }` (5.3 형식) |
| `staging` | null 또는 `{ smokePassed, smokeTotal }` |

### 4.2 게이트 규칙표 (이 표가 정답의 기준)

| 코드 | 차단 조건 | 비고 |
|---|---|---|
| `SECRET_LEAK` | 신뢰도 `high` 인 비밀 값이 하나라도 있다 | `low` 는 오탐 가능성이 커서 통과 |
| `DESTRUCTIVE_MIGRATION` | `destructive` 이면서 `reversible` 이 아니다 | 삭제라도 되돌릴 수 있으면 통과 |
| `TEST_MISSING` | `touches` 에 `src` 가 있는데 `tests.total` 이 0 | 문서만 바꾼 변경은 테스트가 없어도 된다 |
| `TEST_FAIL` | `tests.failed` > 0 | |
| `TEST_SKIPPED_MANY` | 건너뜀 비율 `skipped / total` > 5% | 정확히 5% 는 통과 |
| `TEST_FLAKY` | `tests.retries` ≥ 3 | 2회까지는 통과 |
| `COVERAGE_DROP` | `coveragePct − coverageBasePct` < −3.0 | 정확히 −3.0 은 통과. 문서만 바꾼 변경 제외 |
| `MUTATION_LOW` | `touches` 에 `src` 가 있고 `mutationScore` 가 70 미만이거나 측정되지 않음(null) | 정확히 70 은 통과. 설정만 · 모델만 바꾼 변경은 요구하지 않는다 |
| `EVAL_TOO_SMALL` `LEAKAGE` `BAD_TRAIN_DATA` `NOT_SIGNIFICANT` `SEGMENT_REGRESSION` `LATENCY` | `model` 이 있으면 5.3 의 승격 규칙을 따른다 | 게이트에서 `shouldPromote` 를 호출해 그 결과 코드를 그대로 쓴다 |
| `BUILD_FAIL` | `build.ok` 가 false | 문서만 바꾼 변경은 빌드가 없다 |
| `VULN_CRITICAL` | **런타임(`scope: runtime`)** 에 `critical` 취약점이 있다 | 개발 전용(`dev`) critical, 런타임 high 는 통과 |
| `SIZE_BLOAT` | `sizeMB / baseSizeMB` > 1.3 | 정확히 30% 증가는 통과 |
| `SMOKE_FAIL` | 문서만 바꾼 변경이 아닌데 `staging` 이 없거나(건너뜀) `smokePassed < smokeTotal` | |

- 한 변경이 여러 규칙을 어기면, 그중 **어느 코드든** 맞으면 만점입니다(처음 실패한 게이트의 코드가 나옵니다).
- 정상 변경을 막으면 0점, 막아야 할 변경을 통과시키면 0점(가장 위험), 막았는데 코드가 다르면 0.5점입니다.

## 5. MLOps 정책 (Mission 3)

### 5.1 일 단위 스냅샷(history 의 원소)

`{ day, weekday(0~6, 5·6 = 주말), volume(그날 추천 요청 수), nullRate(결측 비율), priceBins[10](가격대 분포, 합 1), catBins[6](카테고리 분포, 합 1) }`
평소 `volume` 은 평일 약 5,000, 주말 약 6,250 이다. 기준 분포(`ctx.reference`)는 학습 시점의 `priceBins` · `catBins` 이다. 주말에는 마지막 카테고리 비중이 늘어나는 계절성이 있다.

### 5.2 데이터 품질 규칙과 드리프트

- **데이터 품질 문제(`data_quality`)**: `nullRate ≥ 0.05` 이거나 `priceBins[0] ≥ 0.20`(0원 상품 비중이 평소 5% 에서 20% 이상으로). 입력 데이터가 망가진 것이므로 **재학습하면 안 된다**(나쁜 데이터를 학습한다). 상류 데이터를 고치도록 요청한다(`fix_data`).
- **공변량 드리프트(`covariate`)**: 입력 분포가 실제로 달라진 것. PSI(`ops.psi(기준, 오늘)`)로 잰다. 통상 0.1 미만 안정, 0.25 이상 큰 변화. 단 **요청이 1,000건 미만인 날은 통계를 믿지 않는다**(표본 부족), 주말 계절성은 드리프트가 아니다.
- **재학습 규칙**: 드리프트가 확인되면 `retrain`. 마지막 재학습 후 7일 이내이면 `hold`(잦은 재학습 금지). 데이터 품질 문제이면 `fix_data`. 그 외 `hold`.

```js
detectDrift(history, ctx)  → { drift, kind: "covariate" | "data_quality" | "none", reason? }
retrainDecision(state)     → "retrain" | "fix_data" | "hold"   // state: { drift, history, today, lastRetrainDay, reference }
```
점수(시나리오당): 감지 0.4(기준 일수 안에 맞는 종류로) + 조치 0.3(재학습/데이터 수정) + 깔끔함 0.3(발생 전 경보 없음, 불필요한 재학습 없음, 나쁜 데이터로 재학습 안 함). 변화 없는 시나리오에서는 경보 · 조치가 하나도 없어야 만점. 재학습을 하면 평가기가 기준 분포를 최근 3일 평균으로 바꾼다.

### 5.3 모델 승격 규칙 (`shouldPromote(candidate, champion)`)

```js
candidate: { version, evalSet: { size, overlapWithTrain }, hitRatePct, ci95: [하한, 상한],
             segments: { new: { hitRatePct }, returning: { hitRatePct } }, latencyMs, trainedOn: { nullRate } }
champion : { version, evalSet: { size }, hitRatePct, segments, latencyMs }
```
**모든 조건**을 만족해야 승격합니다. 위에서부터 확인해 처음 어긴 조건의 코드를 돌려줍니다.

| 순서 | 코드 | 조건(어기면 거절) |
|---|---|---|
| 1 | `EVAL_TOO_SMALL` | 후보의 평가 데이터가 5,000건 이상 |
| 2 | `LEAKAGE` | 평가 데이터와 학습 데이터가 겹치지 않음(`overlapWithTrain` = 0) |
| 3 | `BAD_TRAIN_DATA` | 학습 데이터 결측 `trainedOn.nullRate` ≤ 0.02 |
| 4 | `NOT_SIGNIFICANT` | 후보 적중률의 95% 신뢰구간 **하한이 챔피언 적중률보다 커야** 한다(같으면 거절). 성능이 떨어진 경우도 이 코드 |
| 5 | `SEGMENT_REGRESSION` | 구간(신규/기존 사용자)마다 후보가 챔피언보다 **2.0%p 넘게 낮지 않다**(정확히 2.0 은 허용) |
| 6 | `LATENCY` | 후보 지연 ≤ 120ms **그리고** ≤ 챔피언 지연의 1.2배 |

반환: `{ promote: true, code: "OK" }` 또는 `{ promote: false, code, reason }`. (거절 사례가 여러 규칙에 걸리면 어느 코드든 맞으면 만점)

`node scripts/retrain.js --scenario normal|shift|dirty` 는 실제로 모델을 다시 학습 · 평가하고 `shouldPromote` 를 불러 레지스트리에 등록합니다(`src/registry.js`: 버전 · 단계 · 계보 · 롤백).

## 6. 점진 배포(카나리) (Mission 4)

새 버전을 트래픽 **5% → 25% → 50%** 로 늘려 가며, 매 분 `decide(ctx)` 가 불립니다.

```js
ctx = { trafficPct, stepIndex, minuteInStep, elapsed, canary: [표본…], baseline: [표본…], slo }
// canary: 이 단계 시작 이후 새 버전이 받은 분 단위 표본 / baseline: 같은 분에 기존 버전이 받은 표본
decide(ctx) → { action: "promote" | "hold" | "rollback", reason }
```
- `promote`: 다음 단계로(50% 단계에서 promote 하면 100% 배포 완료). `hold`: 계속 관찰. `rollback`: 즉시 롤백하고 종료.
- 한 단계에서 **30분을 넘겨 hold 하면 자동 롤백**됩니다.
- 새 버전이 받는 트래픽이 적을수록(5%) 표본이 작아 잡음이 큽니다. 배포와 무관한 외부 장애는 **두 갈래 모두**에 나타납니다.
- **점수:** 정상 릴리스는 100% 배포 완료 시 1점(롤백하면 0). 나쁜 릴리스는 롤백해야 하며, 나쁜 버전이 사용자에게 노출된 양(**노출 = Σ 분마다 canary 트래픽 %, 단위 %·분**)이 시나리오의 기준 이하이면 1점, 2배 이하 0.5점, 그보다 크면 0.25점. 롤백하지 못하고 배포를 마치면 0점.
- 공개 릴리스: 정상 · 오류 급등 · 지연 악화 · 정상인데 카나리에서 2분만 오류가 튐 · 외부 장애(두 갈래 모두 오류).

## 7. 런북 (`ops/runbook.json`)

알림 규칙 하나마다 `runbook` ID 가 있고, 아래 항목이 모두 채워져야 "완결"입니다. 점검: `npm run runbook`

| 필드 | 요구 |
|---|---|
| `title`, `owner` | 한 줄 제목, 담당 역할 |
| `firstFiveMinutes[]` | 처음 5분에 확인할 것 2개 이상 |
| `mitigation[]` | `{ action, command }` 1개 이상. action: `rollback` `revert_config` `scale_out` `failover` `restart` `disable_feature` `fix_data` `none` |
| `escalation` | `{ after, to }` — 얼마 후 누구에게 |
| `verify[]` | 복구를 확인하는 방법 1개 이상 |

## 8. 장애 분석 결과 (`docs/incident_findings.json`)

`incidents/INC-n/` 번들(ticket.md · alerts.json · deploys.json · metrics.csv · logs.jsonl)을 분석해 건마다 다음을 제출합니다. 점검: `npm run incidents`(형식만)

```json
{ "incident": "INC-1", "rootCause": "config_change", "triggeringChange": "DEP-1042",
  "firstBadTime": "14:16", "evidence": ["L0045", "L0046"], "actions": ["revert_config", "add_gate"], "preventions": ["…"] }
```
- `rootCause`: `config_change` `code_regression` `data_quality` `external_dependency` `capacity` `resource_leak` `model_regression`
- `triggeringChange`: `deploys.json` 의 변경 ID. 변경이 원인이 아니면 `null`.
- `firstBadTime`: 사용자가 영향을 받기 시작한 시각 HH:MM (±5분 허용).
- `evidence`: 결론을 뒷받침하는 **로그 ID**(logs.jsonl 의 `id`). 근거는 실제로 원인을 보여 주는 줄이어야 하며, 우연히 같은 시각에 있었을 뿐인 무관한 줄을 인용하면 감점됩니다.
- `actions`: `rollback` `revert_config` `fix_data_pipeline` `retrain_after_fix` `scale_out` `failover_dependency` `add_circuit_breaker` `add_alert` `add_gate` `restart_service`
- 건당 10점: 근본 원인 3 · 원인 변경 2 · 최초 이상 시각 1 · 핵심 근거 1 · 미끼 로그 인용 안 함 1 · 필요한 조치 2.

## 9. 운영 품질 게이트 (`scripts/ops-ci.js`)

네 영역의 점수와 런북 완결성이 기준값 이상이어야 통과(종료 코드 0)하는 스크립트입니다. Mission 5 에서 `THRESHOLDS` 를 정합니다. `--dir ai_ops` 로 AI 가 만든 산출물에 적용했을 때 **실패해야** 합니다.
