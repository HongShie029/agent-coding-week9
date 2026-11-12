// 공개(연습용) 시나리오 모음. 채점에는 이것과 다른 숨은 시나리오가 쓰인다.
const { REF, norm } = require("../drift");

// ---- M2 알림: 하루(1440분) 지표 시나리오. expect: page(호출 필요) | any(알림 필요) | none(호출 금지)
const alerts = [
  { id: "A1-normal_day", seed: 11, startMinuteOfDay: 0, events: [], expect: "none", title: "평범한 하루" },
  { id: "A2-flash_sale", seed: 12, startMinuteOfDay: 0, events: [
      { type: "traffic", start: 1100, end: 1140, value: 3.5, ramp: 5 }, { type: "p95mult", start: 1100, end: 1140, value: 1.2, ramp: 5 }],
    expect: "none", title: "타임세일(트래픽 3.5배, 정상 동작)" },
  { id: "A3-blip", seed: 13, startMinuteOfDay: 0, events: [{ type: "err", start: 600, end: 603, value: 0.10 }],
    expect: "none", title: "3분짜리 일시 오류 급증(스스로 회복)" },
  { id: "A4-bad_deploy", seed: 14, startMinuteOfDay: 0, events: [{ type: "err", start: 600, end: 660, value: 0.07 }],
    expect: "page", incident: { start: 600, end: 660 }, sla: 5, title: "배포 직후 오류율 급등" },
  { id: "A5-latency_creep", seed: 15, startMinuteOfDay: 0, events: [{ type: "p95", start: 700, end: 800, value: 600, ramp: 45 }],
    expect: "page", incident: { start: 700, end: 800 }, sla: 25, title: "응답 지연이 서서히 증가(메모리 누수형)" },
];

// ---- M3 드리프트: 일 단위 시나리오 (60일). expectKind: none | covariate | data_quality
const T_SURGE = norm([0.18, 0.15, 0.14, 0.30, 0.13, 0.10]);
const drift = [
  { id: "D1-stable", seed: 31, days: 60, events: [], expectKind: "none", title: "안정(주말 계절성 포함)" },
  { id: "D2-sudden_shift", seed: 32, days: 60, events: [{ type: "cat", start: 20, ramp: 0, target: T_SURGE }],
    expectKind: "covariate", onset: 20, sla: 3, title: "프로모션으로 카테고리 구성이 갑자기 변함" },
  { id: "D3-data_break", seed: 33, days: 60, events: [{ type: "dq", start: 18, nullRate: 0.12, zeroPrice: 0.30 }],
    expectKind: "data_quality", onset: 18, sla: 2, title: "상류 ETL 변경으로 가격이 null → 0" },
  { id: "D4-low_volume", seed: 34, days: 60, events: [], lowVolumeDays: [14, 15, 37], expectKind: "none", title: "명절 · 장애로 요청이 거의 없는 날" },
];

// ---- M4 롤아웃: 새 버전(릴리스) 시나리오. bad: 새 버전이 나쁜가. expect: complete | rollback
const rollouts = [
  { id: "R1-good", seed: 41, startMinuteOfDay: 840, events: [], bad: false, expect: "complete", title: "정상 릴리스" },
  { id: "R2-err_spike", seed: 42, startMinuteOfDay: 840, events: [{ type: "err", arm: "canary", start: 0, end: 999, value: 0.06 }],
    bad: true, badFrom: 0, expect: "rollback", exposureFull: 60, exposureHalf: 160, title: "신버전이 오류를 낸다" },
  { id: "R3-latency_regress", seed: 43, startMinuteOfDay: 840, events: [{ type: "p95mult", arm: "canary", start: 0, end: 999, value: 1.7 }],
    bad: true, badFrom: 0, expect: "rollback", exposureFull: 100, exposureHalf: 250, title: "신버전이 느려졌다" },
  { id: "R4-transient_canary", seed: 44, startMinuteOfDay: 840, events: [{ type: "err", arm: "canary", start: 2, end: 4, value: 0.12 }],
    bad: false, expect: "complete", title: "정상 릴리스인데 카나리에서 2분만 오류가 튄다(우연)" },
  { id: "R5-upstream_incident", seed: 45, startMinuteOfDay: 840, events: [{ type: "err", arm: "both", start: 3, end: 10, value: 0.06 }],
    bad: false, expect: "complete", title: "배포와 무관한 외부 장애(두 갈래 모두 오류)" },
];

module.exports = { alerts, drift, rollouts, REF };
