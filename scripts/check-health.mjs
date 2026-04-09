/**
 * Smoke check: after Docker stack, only the gateway is published — default checks gateway only.
 * Local dev (all ports on host): node scripts/check-health.mjs --all
 */
const checkAll = process.argv.includes("--all");

const gatewayPort = Number(process.env.GATEWAY_PORT ?? "3000");
const urls = [["gateway", `http://127.0.0.1:${gatewayPort}/health`]];

if (checkAll) {
  const login = Number(process.env.LOGIN_SERVER_PORT ?? "3001");
  const world = Number(process.env.WORLD_SERVER_PORT ?? "3002");
  const combat = Number(process.env.COMBAT_SERVER_PORT ?? "3003");
  urls.push(
    ["login-server", `http://127.0.0.1:${login}/health`],
    ["world-server", `http://127.0.0.1:${world}/health`],
    ["combat-server", `http://127.0.0.1:${combat}/health`],
  );
}

let failed = false;
for (const [name, url] of urls) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    const ok = res.ok;
    console.log(
      JSON.stringify({ service: name, url, status: res.status, ok }),
    );
    if (!ok) {
      failed = true;
    }
  } catch (e) {
    failed = true;
    console.log(
      JSON.stringify({
        service: name,
        url,
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      }),
    );
  }
}
process.exit(failed ? 1 : 0);
