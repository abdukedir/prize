import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

process.env.NODE_ENV = "production";
process.env.NEXT_TELEMETRY_DISABLED = "1";

rmSync(".next", { recursive: true, force: true });
rmSync("pages", { recursive: true, force: true });

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
  writeFileSync(envPath, `${sanitizedEnv.replace(/\s*$/, "")}\nNODE_ENV=production\n`);
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
