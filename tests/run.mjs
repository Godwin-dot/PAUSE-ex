/* Lance chaque suite de tests dans un processus neuf et agrège le statut. */
import { spawn } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SUITES = ["stats.test.mjs", "clean-it.test.mjs", "one-second.test.mjs", "popup.test.mjs"];

const results = [];
for (const suite of SUITES) {
  await new Promise((done) => {
    const child = spawn(process.execPath, [resolve(HERE, suite)], { stdio: "inherit" });
    child.on("close", (code) => {
      results.push({ suite, code: Number(code) });
      done();
    });
  });
  console.log("\n----------------------------------------\n");
}

const anyFail = results.some((r) => r.code !== 0);
console.log(anyFail ? "RÉSULTAT : des échecs" : "RÉSULTAT : tout passe");
for (const r of results) console.log(`  ${r.suite} -> ${r.code === 0 ? "OK" : "ECHEC"}`);
process.exitCode = anyFail ? 1 : 0;