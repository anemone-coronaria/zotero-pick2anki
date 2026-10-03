import { build } from "esbuild";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outfile = resolve(root, "test/dist/i18n.mjs");

await build({
  entryPoints: [resolve(root, "test/i18n.ts")],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  packages: "external",
  outfile,
  logLevel: "warning",
});

const child = spawn(process.execPath, [outfile], { stdio: "inherit", cwd: root });
child.on("exit", (code) => process.exit(code ?? 1));
