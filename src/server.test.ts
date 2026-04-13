import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createServer, resetDeployGateForTests } from "./server";
import { baseConfig } from "./test/fixtures";

describe("HTTP server", () => {
  let server: ReturnType<typeof Bun.serve>;
  let baseUrl: string;
  let workDir: string;
  const secret = "hook-test-secret";

  beforeAll(async () => {
    workDir = await mkdtemp(join(tmpdir(), "stevedore-http-"));
    server = createServer(
      baseConfig({
        secret,
        composeProjectDir: workDir,
        deployCommand: "printf stevedore-ok",
        requestBodyMaxBytes: 64,
        deployTimeoutMs: 5000,
        listenHost: "127.0.0.1",
        port: 0,
      }),
    );
    baseUrl = `http://${server.hostname}:${server.port}`;
  });

  afterAll(() => {
    resetDeployGateForTests();
    server.stop();
    return rm(workDir, { recursive: true, force: true });
  });

  test("GET /healthz returns ok", async () => {
    const res = await fetch(`${baseUrl}/healthz`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  test("unknown route returns 404", async () => {
    const res = await fetch(`${baseUrl}/nope`);
    expect(res.status).toBe(404);
  });

  test("GET /hook returns 405 (POST only)", async () => {
    const res = await fetch(`${baseUrl}/hook`);
    expect(res.status).toBe(405);
  });

  test("POST /hook without auth returns 401", async () => {
    const res = await fetch(`${baseUrl}/hook`, { method: "POST" });
    expect(res.status).toBe(401);
    const j = (await res.json()) as { error: string };
    expect(j.error).toBe("unauthorized");
  });

  test("POST /hook with wrong secret returns 401", async () => {
    const res = await fetch(`${baseUrl}/hook`, {
      method: "POST",
      headers: { Authorization: "Bearer wrong" },
    });
    expect(res.status).toBe(401);
  });

  test("POST /hook with valid Bearer runs deploy and returns 200", async () => {
    const res = await fetch(`${baseUrl}/hook`, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}` },
      body: "{}",
    });
    expect(res.status).toBe(200);
    const j = (await res.json()) as { ok: boolean; stdout: string };
    expect(j.ok).toBe(true);
    expect(j.stdout).toBe("stevedore-ok");
  });

  test("POST /hook with X-Stevedore-Secret runs deploy", async () => {
    const res = await fetch(`${baseUrl}/hook`, {
      method: "POST",
      headers: { "X-Stevedore-Secret": secret },
    });
    expect(res.status).toBe(200);
  });

  test("POST /hook rejects oversized body", async () => {
    const res = await fetch(`${baseUrl}/hook`, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}` },
      body: "x".repeat(100),
    });
    expect(res.status).toBe(413);
  });

  test("POST /hook returns 500 when deploy fails", async () => {
    resetDeployGateForTests();
    const port = await findFreePort();
    const s = createServer(
      baseConfig({
        secret,
        composeProjectDir: workDir,
        deployCommand: "exit 42",
        listenHost: "127.0.0.1",
        port,
      }),
    );
    try {
      const url = `http://127.0.0.1:${port}`;
      const res = await fetch(`${url}/hook`, {
        method: "POST",
        headers: { Authorization: `Bearer ${secret}` },
      });
      expect(res.status).toBe(500);
      const j = (await res.json()) as { error: string; exitCode: number };
      expect(j.error).toBe("deploy_failed");
      expect(j.exitCode).toBe(42);
    } finally {
      s.stop();
    }
  });

  test("concurrent POST /hook returns 409 while deploy is in progress", async () => {
    resetDeployGateForTests();
    const port = await findFreePort();
    const s = createServer(
      baseConfig({
        secret,
        composeProjectDir: workDir,
        deployCommand: "sleep 2",
        deployTimeoutMs: 10_000,
        listenHost: "127.0.0.1",
        port,
      }),
    );
    try {
      const url = `http://127.0.0.1:${port}`;
      const slow = fetch(`${url}/hook`, {
        method: "POST",
        headers: { Authorization: `Bearer ${secret}` },
      });
      await new Promise((r) => setTimeout(r, 100));
      const impatient = await fetch(`${url}/hook`, {
        method: "POST",
        headers: { Authorization: `Bearer ${secret}` },
      });
      expect(impatient.status).toBe(409);
      const j = (await impatient.json()) as { error: string };
      expect(j.error).toBe("deploy_in_progress");
      await slow;
    } finally {
      s.stop();
    }
  });
});

async function findFreePort(): Promise<number> {
  const s = Bun.listen({
    hostname: "127.0.0.1",
    port: 0,
    socket: {
      data() {},
    },
  });
  const p = s.port;
  s.stop();
  return p;
}
