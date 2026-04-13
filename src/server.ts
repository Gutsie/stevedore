import { verifySecret } from "./auth";
import type { StevedoreConfig } from "./config";
import { resolveDeployShellCommand, runDeploy } from "./deploy";

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };

function log(event: string, fields: Record<string, unknown>) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), event, ...fields }));
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

let deployLocked = false;

async function readBodyLimited(req: Request, maxBytes: number): Promise<ArrayBuffer | Response> {
  const cl = req.headers.get("content-length");
  if (cl !== null) {
    const n = Number.parseInt(cl, 10);
    if (Number.isFinite(n) && n > maxBytes) {
      return jsonResponse(413, {
        error: "payload_too_large",
        message: `Body exceeds STEVEDORE_REQUEST_BODY_MAX_BYTES (${maxBytes})`,
      });
    }
  }

  const buf = await req.arrayBuffer();
  if (buf.byteLength > maxBytes) {
    return jsonResponse(413, {
      error: "payload_too_large",
      message: `Body exceeds STEVEDORE_REQUEST_BODY_MAX_BYTES (${maxBytes})`,
    });
  }
  return buf;
}

export function createServer(config: StevedoreConfig): ReturnType<typeof Bun.serve> {
  const shellCommand = resolveDeployShellCommand(config);

  log("server_start", {
    listenHost: config.listenHost,
    port: config.port,
    composeProjectDir: config.composeProjectDir,
    composeCli: config.composeCli,
    hasCustomDeployCommand: Boolean(config.deployCommand),
  });

  return Bun.serve({
    hostname: config.listenHost,
    port: config.port,
    async fetch(req) {
      const url = new URL(req.url);
      const path = url.pathname;

      if (path === "/healthz" && req.method === "GET") {
        return jsonResponse(200, { ok: true });
      }

      if (path === "/hook") {
        if (req.method !== "POST") {
          return jsonResponse(405, { error: "method_not_allowed", message: "Use POST" });
        }

        const authOk = verifySecret(
          req.headers.get("authorization"),
          req.headers.get("x-stevedore-secret"),
          config.secret,
        );
        if (!authOk) {
          log("hook_auth_failed", {});
          return jsonResponse(401, { error: "unauthorized", message: "Invalid or missing credentials" });
        }

        const bodyOrError = await readBodyLimited(req, config.requestBodyMaxBytes);
        if (bodyOrError instanceof Response) return bodyOrError;

        if (deployLocked) {
          log("hook_rejected_busy", {});
          return jsonResponse(409, {
            error: "deploy_in_progress",
            message: "Another deploy is running; try again later",
          });
        }

        deployLocked = true;
        const started = performance.now();
        log("deploy_start", {});

        try {
          const result = await runDeploy(config, shellCommand);
          const durationMs = Math.round(performance.now() - started);

          log("deploy_finish", {
            durationMs,
            exitCode: result.exitCode,
            timedOut: result.timedOut,
          });

          if (result.timedOut) {
            return jsonResponse(504, {
              error: "deploy_timeout",
              message: `Deploy exceeded STEVEDORE_DEPLOY_TIMEOUT_MS (${config.deployTimeoutMs})`,
              stdout: result.stdout,
              stderr: result.stderr,
            });
          }

          if (result.exitCode !== 0) {
            return jsonResponse(500, {
              error: "deploy_failed",
              message: "Deploy command exited non-zero",
              exitCode: result.exitCode,
              stdout: result.stdout,
              stderr: result.stderr,
            });
          }

          return jsonResponse(200, {
            ok: true,
            durationMs,
            exitCode: result.exitCode,
            stdout: result.stdout,
            stderr: result.stderr,
          });
        } catch (err) {
          const durationMs = Math.round(performance.now() - started);
          const message = err instanceof Error ? err.message : String(err);
          log("deploy_error", { durationMs, message });
          return jsonResponse(500, {
            error: "deploy_error",
            message,
          });
        } finally {
          deployLocked = false;
        }
      }

      return jsonResponse(404, { error: "not_found" });
    },
  });
}
