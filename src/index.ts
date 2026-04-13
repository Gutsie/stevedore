import { loadConfig } from "./config";
import { createServer } from "./server";

try {
  const config = loadConfig();
  createServer(config);
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(JSON.stringify({ ts: new Date().toISOString(), event: "fatal_config", message }));
  process.exit(1);
}
