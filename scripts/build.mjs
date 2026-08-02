import { rmSync } from "node:fs";
import { spawnSync } from "node:child_process";

process.env.NODE_ENV = "production";

rmSync(".next", { recursive: true, force: true });

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
