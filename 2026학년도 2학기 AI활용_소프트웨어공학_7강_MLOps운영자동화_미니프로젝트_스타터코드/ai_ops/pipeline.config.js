// AI 가 만들어 준 파이프라인 구성 (build → test → deploy)
const ok = { pass: true };
module.exports = {
  stages: [
    { name: "test", gates: [{ id: "tests-pass", check: (c) => (c.tests.failed === 0 ? ok : { pass: false, code: "TEST_FAIL" }) }] },
    { name: "build", gates: [{ id: "build-ok", check: (c) => (c.build && c.build.ok === false ? { pass: false, code: "BUILD_FAIL" } : ok) }] },
    { name: "deploy", gates: [] },
  ],
};
