import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { basename, join } from "node:path";
import { tmpdir } from "node:os";
import type { StevedoreConfig } from "./config";
import { resolveDeployShellCommand, runDeploy } from "./deploy";

function cfg(partial: Partial<StevedoreConfig>): StevedoreConfig {
  return {
    secret: "s",
    composeProjectDir: "/tmp",
    composeFiles: undefined,
    composeCli: "docker compose",
    deployCommand: undefined,
    listenHost: "127.0.0.1",
    port: 8080,
    requestBodyMaxBytes: 1024,
    deployTimeoutMs: 5000,
    ...partial,
  };
}

describe("resolveDeployShellCommand", () => {
  test("uses custom deploy command when set", () => {
    const c = cfg({ deployCommand: "  ./my-deploy.sh  " });
    expect(resolveDeployShellCommand(c)).toBe("./my-deploy.sh");
  });

  test("default uses docker compose pull && up -d", () => {
    const c = cfg({ composeCli: "docker compose", deployCommand: undefined });
    expect(resolveDeployShellCommand(c)).toBe("docker compose pull && docker compose up -d");
  });

  test("default repeats -f for each compose file", () => {
    const c = cfg({
      composeCli: "docker-compose",
      composeFiles: ["compose.yaml", "override.yml"],
      deployCommand: undefined,
    });
    expect(resolveDeployShellCommand(c)).toBe(
      "docker-compose -f compose.yaml -f override.yml pull && docker-compose -f compose.yaml -f override.yml up -d",
    );
  });

  test("shell-quotes compose file paths with special characters", () => {
    const c = cfg({
      composeCli: "docker-compose",
      composeFiles: ["my app's stack.yml"],
      deployCommand: undefined,
    });
    expect(resolveDeployShellCommand(c)).toContain("-f 'my app'\\''s stack.yml'");
  });
});

describe("runDeploy", () => {
  test("runs successful command in compose project dir", async () => {
    const dir = await mkdtemp(join(tmpdir(), "stevedore-test-"));
    try {
      const c = cfg({ composeProjectDir: dir, deployTimeoutMs: 5000 });
      const r = await runDeploy(c, "printf hello");
      expect(r.exitCode).toBe(0);
      expect(r.timedOut).toBe(false);
      expect(r.stdout).toBe("hello");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("captures stderr and non-zero exit", async () => {
    const dir = await mkdtemp(join(tmpdir(), "stevedore-test-"));
    try {
      const c = cfg({ composeProjectDir: dir });
      const r = await runDeploy(c, "echo err >&2; exit 7");
      expect(r.exitCode).toBe(7);
      expect(r.stderr.trim()).toBe("err");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("kills long-running command when timeout elapses", async () => {
    const dir = await mkdtemp(join(tmpdir(), "stevedore-test-"));
    try {
      const c = cfg({ composeProjectDir: dir, deployTimeoutMs: 150 });
      const r = await runDeploy(c, "sleep 30");
      expect(r.timedOut).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("cwd is compose project dir", async () => {
    const dir = await mkdtemp(join(tmpdir(), "stevedore-test-"));
    await mkdir(join(dir, "nested"), { recursive: true });
    try {
      const c = cfg({ composeProjectDir: dir });
      const r = await runDeploy(c, "basename \"$PWD\"");
      expect(r.stdout.trim()).toBe(basename(dir));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
