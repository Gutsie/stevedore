import type { StevedoreConfig } from "./config";

export type DeployResult = {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
};

function buildDefaultCommand(config: StevedoreConfig): string {
  const files = config.composeFiles ?? [];
  const fileArgs = files.map((f) => `-f ${shellQuote(f)}`).join(" ");
  const cli = config.composeCli;
  const prefix = fileArgs ? `${cli} ${fileArgs}` : cli;
  return `${prefix} pull && ${prefix} up -d`;
}

function shellQuote(path: string): string {
  if (!/[^\w@%+=:,./-]/.test(path)) return path;
  return `'${path.replace(/'/g, `'\\''`)}'`;
}

export function resolveDeployShellCommand(config: StevedoreConfig): string {
  if (config.deployCommand && config.deployCommand.trim() !== "") {
    return config.deployCommand.trim();
  }
  return buildDefaultCommand(config);
}

export async function runDeploy(
  config: StevedoreConfig,
  shellCommand: string,
): Promise<DeployResult> {
  const proc = Bun.spawn(["sh", "-c", shellCommand], {
    cwd: config.composeProjectDir,
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env },
  });

  const stdoutPromise = new Response(proc.stdout).text().catch(() => "");
  const stderrPromise = new Response(proc.stderr).text().catch(() => "");

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<"timeout">((resolve) => {
    timeoutId = setTimeout(() => resolve("timeout"), config.deployTimeoutMs);
  });

  const exitPromise = proc.exited.then((code) => ({ type: "exit" as const, code }));
  const winner = await Promise.race([exitPromise, timeoutPromise]);

  if (winner === "timeout") {
    try {
      proc.kill("SIGKILL");
    } catch {
      /* ignore */
    }
    return {
      exitCode: null,
      stdout: "",
      stderr: "",
      timedOut: true,
    };
  }

  if (timeoutId !== undefined) clearTimeout(timeoutId);
  const [stdout, stderr] = await Promise.all([stdoutPromise, stderrPromise]);
  return {
    exitCode: winner.code,
    stdout,
    stderr,
    timedOut: false,
  };
}
