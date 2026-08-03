import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const server = resolve(root, ".next/standalone/server.js");

process.env.NODE_ENV = "production";
process.env.PORT ||= "3000";
process.env.HOSTNAME ||= "0.0.0.0";

if (!existsSync(server)) {
  console.error("Standalone server not found. Run npm run build before npm start.");
  process.exit(1);
}

console.log(`Starting standalone Next server with NODE_ENV=${process.env.NODE_ENV}`);

const result = spawnSync(process.execPath, [server], {
  cwd: root,
  stdio: "inherit",
  env: process.env
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
