#!/usr/bin/env node
// 런북 완결성 점검: 알림 규칙마다 런북(ops/runbook.json)이 있고 필수 항목이 채워져 있는가
const fs = require("fs"), path = require("path");
const ACTIONS = ["rollback", "revert_config", "scale_out", "failover", "restart", "disable_feature", "fix_data", "none"];
const str = (x) => typeof x === "string" && x.trim().length > 2;
const list = (a, n) => Array.isArray(a) && a.filter(str).length >= n;
function problems(e) {
  if (!e || typeof e !== "object") return ["항목 없음"];
  const p = [];
  if (!str(e.owner)) p.push("owner");
  if (!str(e.title)) p.push("title");
  if (!list(e.firstFiveMinutes, 2)) p.push("firstFiveMinutes(2개 이상)");
  if (!Array.isArray(e.mitigation) || !e.mitigation.some((m) => m && ACTIONS.includes(m.action) && str(m.command))) p.push("mitigation(action+command)");
  if (!e.escalation || !str(e.escalation.after) || !str(e.escalation.to)) p.push("escalation(after,to)");
  if (!list(e.verify, 1)) p.push("verify");
  return p;
}
function check(root, { dir = null } = {}) {
  const alertsPath = path.resolve(root, dir ? path.join(dir, "alerts.js") : "monitoring/alerts.js");
  let rules = [];
  try { delete require.cache[require.resolve(alertsPath)]; rules = require(alertsPath).rules || []; } catch (e) { return { score: 0, items: [], error: "알림 규칙을 불러오지 못했습니다: " + e.message.split("\n")[0] }; }
  let book = {};
  try { book = JSON.parse(fs.readFileSync(path.resolve(root, "ops/runbook.json"), "utf8")); } catch { /* 없으면 빈 런북 */ }
  const items = rules.filter((r) => !/^example/.test(r.id || "")).map((r) => {   // 예시 규칙(example-…)은 점수에 넣지 않는다
    
    if (!r.runbook) return { rule: r.id, ok: false, why: ["규칙에 runbook 필드 없음"] };
    const pr = problems(book[r.runbook]);
    return { rule: r.id, runbook: r.runbook, ok: pr.length === 0, why: pr };
  });
  return { score: items.length ? items.filter((i) => i.ok).length / items.length : 0, items };
}
module.exports = { check, problems };
if (require.main === module) {
  const di = process.argv.indexOf("--dir");
  const r = check(path.resolve(__dirname, ".."), { dir: di >= 0 ? process.argv[di + 1] : null });
  if (r.error) console.log("! " + r.error);
  for (const i of r.items) console.log(`${i.ok ? "✔" : "✘"} ${i.rule} → ${i.runbook || "(런북 없음)"} ${i.ok ? "" : "— 부족: " + i.why.join(", ")}`);
  console.log(`\n런북 완결성: ${(r.score * 100).toFixed(0)}% (${r.items.filter((i) => i.ok).length}/${r.items.length})`);
}
