const { spawn, spawnSync } = require("node:child_process");
const { once } = require("node:events");
const { createInterface } = require("node:readline");
const { resolve } = require("node:path");

const e2eServerPort = 43190;
const e2eClientPort = 45173;
const e2eServerURL = `http://127.0.0.1:${e2eServerPort}`;
const e2eClientURL = `http://127.0.0.1:${e2eClientPort}`;
const startupTimeoutMs = 120_000;
const shutdownTimeoutMs = 2_000;

function rootDir() {
  return resolve(__dirname, "..");
}

function addLocalProxyBypass(env) {
  const next = { ...env };
  for (const key of ["NO_PROXY", "no_proxy"]) {
    const values = new Set(
      (next[key] ?? "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
    );
    values.add("127.0.0.1");
    values.add("localhost");
    values.add("::1");
    next[key] = Array.from(values).join(",");
  }
  return next;
}

function attachLogs(child, name) {
  const logs = [];
  const collect = (line) => {
    logs.push(`[${name}] ${line}`);
    if (logs.length > 80) logs.shift();
    if (process.env.DEBUG_E2E_SERVERS === "true") {
      console.log(`[${name}] ${line}`);
    }
  };

  createInterface({ input: child.stdout }).on("line", collect);
  createInterface({ input: child.stderr }).on("line", collect);
  return logs;
}

function startProcess(name, cwd, args, env) {
  const child = spawn(process.execPath, args, {
    cwd,
    env: addLocalProxyBypass(env),
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  const logs = attachLogs(child, name);
  child.once("exit", (code, signal) => {
    logs.push(`[${name}] exited code=${code ?? "null"} signal=${signal ?? "null"}`);
  });

  return { child, logs, name };
}

async function waitForURL(url, timeoutMs, processInfo) {
  const startedAt = Date.now();
  let lastError = null;

  while (Date.now() - startedAt < timeoutMs) {
    if (processInfo.child.exitCode !== null) {
      throw new Error(`${processInfo.name} exited before ${url} became available.\n${processInfo.logs.join("\n")}`);
    }

    try {
      const response = await fetch(url);
      if (response.ok) return;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (err) {
      lastError = err;
    }

    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
  }

  const errorText = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(
    `${processInfo.name} did not become available at ${url} within ${timeoutMs}ms. Last error: ${errorText}\n${processInfo.logs.join("\n")}`,
  );
}

async function waitForClose(child, timeoutMs) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  await Promise.race([
    once(child, "close"),
    new Promise((resolveDelay) => setTimeout(resolveDelay, timeoutMs)),
  ]);
}

async function stopProcess(processInfo) {
  const { child } = processInfo;
  if (child.exitCode !== null || child.signalCode !== null) return;

  child.kill();
  await waitForClose(child, shutdownTimeoutMs);

  if ((child.exitCode !== null || child.signalCode !== null) || !child.pid) return;

  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
  } else {
    child.kill("SIGKILL");
  }

  await waitForClose(child, shutdownTimeoutMs);
}

module.exports = async function globalSetup() {
  const repoRoot = rootDir();
  const backendCwd = resolve(repoRoot, "runtimes/node");
  const frontendCwd = resolve(repoRoot, "packages/client");
  const baseEnv = addLocalProxyBypass(process.env);
  const managed = [];

  try {
    const backend = startProcess(
      "e2e-server",
      backendCwd,
      [resolve(backendCwd, "node_modules/tsx/dist/cli.mjs"), "src/index.ts"],
      {
        ...baseEnv,
        PORT: String(e2eServerPort),
        DATABASE_PATH: "../../e2e_data/qreminder.db",
        ASSETS_DIR: "../../e2e_data/assets",
        BETTER_AUTH_SECRET: "e2e-test-secret-do-not-use-in-prod",
        APP_URL: e2eServerURL,
        SIGNUP_ENABLED: "true",
        NOTIFICATION_SCHEDULER_ENABLED: "false",
        TRUSTED_ORIGINS: e2eClientURL,
      },
    );
    managed.push(backend);
    await waitForURL(`${e2eServerURL}/api/app/health`, startupTimeoutMs, backend);

    const frontend = startProcess(
      "e2e-client",
      frontendCwd,
      [
        resolve(frontendCwd, "node_modules/vite/bin/vite.js"),
        "--host",
        "127.0.0.1",
        "--port",
        String(e2eClientPort),
        "--strictPort",
      ],
      {
        ...baseEnv,
        VITE_DEV_PROXY_TARGET: e2eServerURL,
        VITE_DISABLE_EXCHANGE_RATE_FETCH: "true",
      },
    );
    managed.push(frontend);
    await waitForURL(e2eClientURL, startupTimeoutMs, frontend);
  } catch (err) {
    await Promise.allSettled([...managed].reverse().map(stopProcess));
    throw err;
  }

  return async () => {
    await Promise.allSettled([...managed].reverse().map(stopProcess));
  };
};
