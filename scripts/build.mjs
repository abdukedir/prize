import { existsSync, readFileSync, renameSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

process.env.NODE_ENV = "development";
process.env.NEXT_TELEMETRY_DISABLED = "1";

rmSync(".next", { recursive: true, force: true });
rmSync("pages", { recursive: true, force: true });

const stalePageFiles = [
  "src/pages/404.js",
  "src/pages/404.jsx",
  "src/pages/404.ts",
  "src/pages/500.js",
  "src/pages/500.jsx",
  "src/pages/500.ts",
  "src/pages/_app.js",
  "src/pages/_app.jsx",
  "src/pages/_app.ts",
  "src/pages/_app.tsx",
  "src/pages/_document.js",
  "src/pages/_document.jsx",
  "src/pages/_document.ts",
  "src/pages/_document.tsx",
  "src/pages/_error.js",
  "src/pages/_error.jsx",
  "src/pages/_error.ts",
  "src/pages/_error.tsx"
];

for (const file of stalePageFiles) {
  if (existsSync(file)) {
    unlinkSync(file);
    console.log(`Removed stale build file: ${file}`);
  }
}

const envPath = ".env";
const envBackupPath = ".env.codex-build-backup";
let restoredEnv = false;

function restoreEnv() {
  if (!restoredEnv && existsSync(envBackupPath)) {
    renameSync(envBackupPath, envPath);
    restoredEnv = true;
  }
}

if (existsSync(envPath)) {
  const originalEnv = readFileSync(envPath, "utf8");
  const sanitizedEnv = originalEnv
    .split(/\r?\n/)
    .filter((line) => !/^\s*NODE_ENV\s*=/.test(line))
    .join("\n");

  renameSync(envPath, envBackupPath);
  writeFileSync(envPath, `${sanitizedEnv.replace(/\s*$/, "")}\nNODE_ENV=development\n`);
  process.on("exit", restoreEnv);
  process.on("SIGINT", () => {
    restoreEnv();
    process.exit(130);
  });
}

console.log(`Building with NODE_ENV=${process.env.NODE_ENV}`);

const npx = process.platform === "win32" ? "npx.cmd" : "npx";

function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
    env: process.env
  });

  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

run(npx, ["prisma", "generate"]);
run(npx, ["next", "build"]);
restoreEnv();
