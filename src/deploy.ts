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

  let timedOut = false;
  const timeoutId = setTimeout(() => {
    timedOut = true;
    try {
      proc.kill("SIGKILL");
    } catch {
      /* ignore */
    }
  }, config.deployTimeoutMs);

  try {
    const [stdoutBuf, stderrBuf] = await Promise.all([
      new Response(proc.stdout).arrayBuffer(),
      new Response(proc.stderr).arrayBuffer(),
    ]);
    const exitCode = await proc.exited;
    clearTimeout(timeoutId);
    return {
      exitCode,
      stdout: new TextDecoder().decode(stdoutBuf),
      stderr: new TextDecoder().decode(stderrBuf),
      timedOut,
    };
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}
