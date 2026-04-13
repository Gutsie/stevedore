import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { loadConfig } from "./config";

const KEYS = [
  "STEVEDORE_SECRET",
  "STEVEDORE_COMPOSE_PROJECT_DIR",
  "STEVEDORE_COMPOSE_FILES",
  "STEVEDORE_DEPLOY_COMMAND",
  "STEVEDORE_COMPOSE_CLI",
  "STEVEDORE_LISTEN_HOST",
  "STEVEDORE_PORT",
  "STEVEDORE_REQUEST_BODY_MAX_BYTES",
  "STEVEDORE_DEPLOY_TIMEOUT_MS",
] as const;

let snapshot: Record<string, string | undefined>;

beforeEach(() => {
  snapshot = {};
  for (const k of KEYS) snapshot[k] = process.env[k];
});

afterEach(() => {
  for (const k of KEYS) {
    const v = snapshot[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

function minimalValidEnv(): void {
  process.env.STEVEDORE_SECRET = "s";
  process.env.STEVEDORE_COMPOSE_PROJECT_DIR = "/project";
}

describe("loadConfig", () => {
  test("throws when STEVEDORE_SECRET is missing", () => {
    delete process.env.STEVEDORE_SECRET;
    process.env.STEVEDORE_COMPOSE_PROJECT_DIR = "/p";
    expect(() => loadConfig()).toThrow(/STEVEDORE_SECRET/);
  });

  test("throws when STEVEDORE_COMPOSE_PROJECT_DIR is missing", () => {
    process.env.STEVEDORE_SECRET = "s";
    delete process.env.STEVEDORE_COMPOSE_PROJECT_DIR;
    expect(() => loadConfig()).toThrow(/STEVEDORE_COMPOSE_PROJECT_DIR/);
  });

  test("parses minimal valid env with defaults", () => {
    minimalValidEnv();
    const c = loadConfig();
    expect(c.secret).toBe("s");
    expect(c.composeProjectDir).toBe("/project");
    expect(c.composeCli).toBe("docker compose");
    expect(c.listenHost).toBe("0.0.0.0");
    expect(c.port).toBe(8080);
    expect(c.requestBodyMaxBytes).toBe(65536);
    expect(c.deployTimeoutMs).toBe(600_000);
    expect(c.composeFiles).toBeUndefined();
    expect(c.deployCommand).toBeUndefined();
  });

  test("parses comma-separated compose files with trimming", () => {
    minimalValidEnv();
    process.env.STEVEDORE_COMPOSE_FILES = " a.yml , b.yml ";
    const c = loadConfig();
    expect(c.composeFiles).toEqual(["a.yml", "b.yml"]);
  });

  test("treats empty compose file list as undefined", () => {
    minimalValidEnv();
    process.env.STEVEDORE_COMPOSE_FILES = " , , ";
    const c = loadConfig();
    expect(c.composeFiles).toBeUndefined();
  });

  test("respects STEVEDORE_COMPOSE_CLI", () => {
    minimalValidEnv();
    process.env.STEVEDORE_COMPOSE_CLI = "docker-compose";
    expect(loadConfig().composeCli).toBe("docker-compose");
  });

  test("throws when STEVEDORE_COMPOSE_CLI is only whitespace", () => {
    minimalValidEnv();
    process.env.STEVEDORE_COMPOSE_CLI = "   ";
    expect(() => loadConfig()).toThrow(/STEVEDORE_COMPOSE_CLI cannot be empty/);
  });

  test("throws on invalid STEVEDORE_PORT", () => {
    minimalValidEnv();
    process.env.STEVEDORE_PORT = "0";
    expect(() => loadConfig()).toThrow(/STEVEDORE_PORT/);
  });

  test("throws on invalid STEVEDORE_REQUEST_BODY_MAX_BYTES", () => {
    minimalValidEnv();
    process.env.STEVEDORE_REQUEST_BODY_MAX_BYTES = "nope";
    expect(() => loadConfig()).toThrow(/STEVEDORE_REQUEST_BODY_MAX_BYTES/);
  });
});
