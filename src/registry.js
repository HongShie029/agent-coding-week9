// 모델 레지스트리: 버전 · 단계(staging/production/archived) · 계보(lineage)를 기록한다.
function createRegistry(state) {
  const s = state || { models: [] };
  const byVersion = (v) => s.models.find((m) => m.version === v);
  return {
    state: s,
    register({ meta }) {
      const version = "v" + (s.models.length + 1);
      s.models.push({ version, stage: "staging", registeredAt: s.models.length, ...meta });
      return version;
    },
    current() { return s.models.find((m) => m.stage === "production") || null; },
    promote(version) {
      const m = byVersion(version); if (!m) throw new Error("없는 버전: " + version);
      const cur = this.current(); if (cur) { cur.stage = "archived"; }   // 이전 운영 버전은 롤백용으로 보관
      m.stage = "production";
    },
    rollback() {
      const cur = this.current(); if (!cur) throw new Error("운영 중인 모델이 없습니다");
      const prev = [...s.models].reverse().find((m) => m.stage === "archived" && m.version !== cur.version);
      if (!prev) throw new Error("되돌릴 이전 버전이 없습니다");
      cur.stage = "rolled_back"; prev.stage = "production"; return prev.version;
    },
    // 감사: 운영 모델에는 데이터 지문 · 코드 커밋 · 평가 지표(계보)가 있어야 한다
    audit() {
      const bad = [];
      for (const m of s.models.filter((x) => x.stage === "production")) {
        for (const f of ["dataHash", "commit", "metrics"]) if (!m[f]) bad.push(`${m.version}: ${f} 누락`);
      }
      return bad;
    },
  };
}
module.exports = { createRegistry };
