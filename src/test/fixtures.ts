import type { StevedoreConfig } from "../config";

export function baseConfig(overrides: Partial<StevedoreConfig> = {}): StevedoreConfig {
  return {
    secret: "test-secret-hexdeadbeef",
    composeProjectDir: "/tmp",
    composeFiles: undefined,
    composeCli: "docker compose",
    deployCommand: "true",
    listenHost: "127.0.0.1",
    port: 0,
    requestBodyMaxBytes: 4096,
    deployTimeoutMs: 30_000,
    ...overrides,
  };
}
