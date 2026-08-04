const { existsSync } = require("node:fs");
const { resolve } = require("node:path");

const server = resolve(__dirname, ".next", "standalone", "server.js");

process.env.NODE_ENV = "production";
process.env.PORT = process.env.PORT || "3000";
process.env.HOSTNAME = process.env.HOSTNAME || "0.0.0.0";

if (!existsSync(server)) {
  console.error("Standalone server not found. Run npm run build before starting the app.");
  process.exit(1);
}

console.log(`Starting standalone Next server on ${process.env.HOSTNAME}:${process.env.PORT}`);

require(server);