#!/usr/bin/env node
// 사용: node scripts/eval.js [alerts|pipeline|policy|rollout|all] [--dir ai_ops] [--json]
const path = require("path");
const { runAll, print } = require("../sim/eval");
const args = process.argv.slice(2);
const what = args.find((a) => !a.startsWith("--") && args[args.indexOf(a) - 1] !== "--dir") || "all";
const di = args.indexOf("--dir");
const res = runAll(path.resolve(__dirname, ".."), { dir: di >= 0 ? args[di + 1] : null });
if (args.includes("--json")) console.log(JSON.stringify(res, null, 2));
else print(res, what);
