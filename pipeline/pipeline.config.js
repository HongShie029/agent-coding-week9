// [Mission 1] 파이프라인 품질 게이트 — 학생이 완성하는 파일
// 구조: stages[] → { name, gates[] } → gate = { id, check(change) → { pass, code?, reason? } }
//   change : 변경 매니페스트(docs/OPS_CONTRACT.md 4장). 단계는 위에서 아래로 실행되고, 처음 실패한 게이트에서 멈춘다.
//   code   : 차단 사유 코드(4.3 표). 코드가 틀리면 부분 점수만 받는다.
// 평가: node scripts/eval.js pipeline   (공개 변경 10건)
const { shouldPromote } = require("../mlops/policy");   // 모델 승격 판단은 Mission 3 에서 만든 함수를 재사용한다
const ok = { pass: true };
const fail = (code, reason) => ({ pass: false, code, reason });

// 문서만 바꾼 변경인가? (touches 가 전부 docs). 계약서 4.2 — 여러 규칙의 공통 예외
const isDocsOnly = (c) => (c.touches || []).length > 0 && c.touches.every((x) => x === "docs");
// 소스 코드(src)를 바꾼 변경인가?
const touchesSrc = (c) => (c.touches || []).includes("src");

module.exports = {
  stages: [
    {
      name: "validate", gates: [
        // 비밀 값(비밀번호 등)이 들어 있으면 막는다. 계약서 4.2 SECRET_LEAK
        // high(확실함)만 막고, low(애매함)는 통과시킨다
        {
          id: "no-secret-leak", check: (c) =>
            ((c.diff?.secrets) || []).some((s) => s.confidence === "high")
              ? fail("SECRET_LEAK", "확실한 비밀 값이 들어 있음") : ok
        },

        // 데이터를 지우는데 되돌릴 수 없으면 막는다. 계약서 4.2 DESTRUCTIVE_MIGRATION
        // 지우더라도 되돌릴 수 있으면 통과시킨다
        {
          id: "safe-migration", check: (c) =>
            (c.migration && c.migration.destructive && !c.migration.reversible)
              ? fail("DESTRUCTIVE_MIGRATION", "되돌릴 수 없는 삭제") : ok
        },
      ]
    },

    {
      name: "test", gates: [
        // 소스를 바꿨는데 테스트가 하나도 없으면 막는다. 계약서 4.2 TEST_MISSING
        // 문서만 바꾼 변경은 src 가 없으니 여기 걸리지 않는다. 가장 먼저 검사한다
        {
          id: "tests-exist", check: (c) =>
            (touchesSrc(c) && !(c.tests?.total > 0))
              ? fail("TEST_MISSING", "소스를 바꿨는데 테스트가 없음") : ok
        },

        // 실패한 테스트가 있으면 막는다. 계약서 4.2 TEST_FAIL
        { id: "tests-pass", check: (c) => (c.tests?.failed > 0 ? fail("TEST_FAIL", "실패한 테스트가 있음") : ok) },

        {
          id: "skipped-ok", check: (c) => {
            const t = c.tests;
            if (!t || !t.total) return ok;   // 테스트 정보가 없으면 여기서는 통과
            // 건너뜀이 5%보다 많으면 막는다. 계약서 4.2 TEST_SKIPPED_MANY
            // 정확히 5%는 통과라서 >= 가 아니라 > 를 쓴다
            return t.skipped * 100 > t.total * 5 ? fail("TEST_SKIPPED_MANY", "건너뛴 테스트가 5%보다 많음") : ok;
          }
        },

        // 다시 돌려서 겨우 통과한 횟수가 3 이상이면 불안정한 테스트라 막는다. 계약서 4.2 TEST_FLAKY
        // 2회까지는 통과라서 >= 3
        {
          id: "flaky-ok", check: (c) =>
            (c.tests?.retries >= 3) ? fail("TEST_FLAKY", "불안정한 테스트(재시도 3회 이상)") : ok
        },

        {
          id: "coverage-ok", check: (c) => {
            if (isDocsOnly(c)) return ok;   // 문서만 바꾼 변경은 제외. 계약서 4.2
            const t = c.tests;
            if (!t || t.coveragePct == null || t.coverageBasePct == null) return ok;   // 값이 없으면 비교하지 않는다
            // 커버리지가 3.0%p 넘게 떨어지면 막는다. 계약서 4.2 COVERAGE_DROP
            // 정확히 -3.0 은 통과. 1e-9 는 소수점 계산 오차 때문에 "딱 -3.0"에서 틀리지 않게 주는 여유
            return (t.coveragePct - t.coverageBasePct) < -3.0 - 1e-9
              ? fail("COVERAGE_DROP", "커버리지가 3.0%p보다 많이 떨어짐") : ok;
          }
        },

        {
          id: "mutation-ok", check: (c) => {
            if (!touchesSrc(c)) return ok;   // 소스를 안 바꾼 변경(설정만·모델만 등)은 요구하지 않는다. 계약서 4.2
            const m = c.tests?.mutationScore;
            // 변이 점수가 70 미만이거나 측정 안 됨(null)이면 막는다. 계약서 4.2 MUTATION_LOW
            // 정확히 70 은 통과. null 은 JS 에서 0 처럼 계산돼서 따로 먼저 검사한다
            return (m == null || m < 70) ? fail("MUTATION_LOW", "변이 점수가 70 미만이거나 측정되지 않음") : ok;
          }
        },
      ]
    },

    {
      name: "model-eval", gates: [
        // 모델 변경이면 모델 승격 규칙(계약서 5.3)으로 판단한다. 계약서 4.2
        // shouldPromote 가 돌려준 code 를 그대로 쓴다 (코드를 새로 만들지 않는다)
        {
          id: "model-promote", check: (c) => {
            if (!c.model) return ok;                          // 모델 변경이 아니면 통과
            if (typeof shouldPromote !== "function") return ok;   // 아직 Mission 3 전이면 건너뜀
            const r = shouldPromote(c.model.candidate, c.model.champion);
            return (r && r.promote === false) ? fail(r.code, r.reason) : ok;
          }
        },
      ]
    },

    {
      name: "build", gates: [
        // 런타임(실제 서비스)에 치명적인 취약점이 있으면 막는다. 계약서 4.2 VULN_CRITICAL
        // 개발 전용(dev)은 통과, 런타임 high도 통과. critical만 막는다
        {
          id: "no-runtime-critical", check: (c) =>
            ((c.build?.vulns) || []).some((v) => v.scope === "runtime" && v.severity === "critical")
              ? fail("VULN_CRITICAL", "런타임에 치명적인 취약점이 있음") : ok
        },
        // 빌드가 실패했으면 막는다. 계약서 4.2 BUILD_FAIL
        // build가 없는 변경(문서만 바꿈)은 ok가 false가 아니라서 자연스럽게 통과한다
        {
          id: "build-ok", check: (c) =>
            c.build?.ok === false ? fail("BUILD_FAIL", "빌드가 실패함") : ok
        },
        // 크기가 기존보다 30%를 넘게 커지면 막는다. 계약서 4.2 SIZE_BLOAT
        // 정확히 30% 증가(1.3배)는 통과라서 >= 가 아니라 > 를 쓴다
        // 1e-9는 소수점 오차 때문에 "딱 30%"에서 틀리지 않게 주는 아주 작은 여유
        {
          id: "size-ok", check: (c) => {
            const b = c.build;
            if (!b || !b.baseSizeMB) return ok;   // 크기 정보가 없거나 기준이 0이면 비교하지 않고 통과
            return b.sizeMB > b.baseSizeMB * 1.3 + 1e-9
              ? fail("SIZE_BLOAT", "크기가 30%보다 많이 커짐") : ok;
          }
        },
      ]
    },
    {
      name: "staging", gates: [
        // 스테이징 스모크 테스트가 실패했거나 건너뛰었으면 막는다. 계약서 4.2 SMOKE_FAIL
        // 문서만 바꾼 변경은 스테이징이 없어도 통과
        {
          id: "smoke-ok", check: (c) => {
            if (isDocsOnly(c)) return ok;
            const s = c.staging;
            if (!s) return fail("SMOKE_FAIL", "스테이징을 건너뜀");
            return s.smokePassed < s.smokeTotal ? fail("SMOKE_FAIL", "스모크 테스트 실패") : ok;
          }
        },
      ]
    },
  ],
};