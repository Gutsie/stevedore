function requiredEnv(name: string): string {
  const v = process.env[name];
  if (v === undefined || v.trim() === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return v.trim();
}

function optionalEnv(name: string): string | undefined {
  const v = process.env[name];
  if (v === undefined || v.trim() === "") return undefined;
  return v.trim();
}

function parsePositiveInt(name: string, raw: string | undefined, fallback: number): number {
  if (raw === undefined) return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`Invalid ${name}: expected positive integer, got ${JSON.stringify(raw)}`);
  }
  return n;
}

export type StevedoreConfig = {
  secret: string;
  composeProjectDir: string;
  composeFiles: string[] | undefined;
  /** Invoked under `sh -c`, e.g. `docker compose` (plugin) or `docker-compose` (standalone). */
  composeCli: string;
  deployCommand: string | undefined;
  listenHost: string;
  port: number;
  requestBodyMaxBytes: number;
  deployTimeoutMs: number;
};

export function loadConfig(): StevedoreConfig {
  const secret = requiredEnv("STEVEDORE_SECRET");
  const composeProjectDir = requiredEnv("STEVEDORE_COMPOSE_PROJECT_DIR");

  const composeFilesRaw = optionalEnv("STEVEDORE_COMPOSE_FILES");
  const composeFiles = composeFilesRaw
    ? composeFilesRaw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : undefined;

  const deployCommand = optionalEnv("STEVEDORE_DEPLOY_COMMAND");

  const composeCliEnv = process.env.STEVEDORE_COMPOSE_CLI;
  if (composeCliEnv !== undefined && composeCliEnv.trim() === "") {
    throw new Error("STEVEDORE_COMPOSE_CLI cannot be empty");
  }
  const composeCli =
    composeCliEnv === undefined || composeCliEnv.trim() === ""
      ? "docker compose"
      : composeCliEnv.trim();

  const listenHost = optionalEnv("STEVEDORE_LISTEN_HOST") ?? "0.0.0.0";
  const port = parsePositiveInt("STEVEDORE_PORT", process.env.STEVEDORE_PORT, 8080);

  const requestBodyMaxBytes = parsePositiveInt(
    "STEVEDORE_REQUEST_BODY_MAX_BYTES",
    process.env.STEVEDORE_REQUEST_BODY_MAX_BYTES,
    65536,
  );

  const deployTimeoutMs = parsePositiveInt(
    "STEVEDORE_DEPLOY_TIMEOUT_MS",
    process.env.STEVEDORE_DEPLOY_TIMEOUT_MS,
    600_000,
  );

  return {
    secret,
    composeProjectDir,
    composeFiles: composeFiles?.length ? composeFiles : undefined,
    composeCli,
    deployCommand,
    listenHost,
    port,
    requestBodyMaxBytes,
    deployTimeoutMs,
  };
}
