// Builds dist/esm (import) and dist/cjs (require), no bundler: the SDK is one
// dependency-free file, so tsc twice is enough. The CommonJS copy is renamed
// to .cjs/.d.cts so it loads correctly whatever "type" the consumer uses.
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const tsc = (args) => execFileSync("npx", ["tsc", ...args], { stdio: "inherit" });
rmSync("dist", { recursive: true, force: true });
tsc(["-p", "tsconfig.json"]);
tsc(["-p", "tsconfig.json", "--module", "commonjs", "--moduleResolution", "node10", "--outDir", "dist/cjs", "--declarationMap", "false", "--sourceMap", "false"]);
for (const f of readdirSync("dist/cjs")) {
  const p = join("dist/cjs", f);
  const to = p.replace(/\.d\.ts$/, ".d.cts").replace(/\.js$/, ".cjs");
  writeFileSync(p, readFileSync(p, "utf8").replace(/(from |require\()(["'])(\.\/[^"']+)\.js\2/g, "$1$2$3.cjs$2"));
  if (to !== p) renameSync(p, to);
}
console.log("built dist/esm and dist/cjs");
