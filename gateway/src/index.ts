import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { createProxyMiddleware } from "http-proxy-middleware";
import type { Socket } from "node:net";
import { config } from "./config.js";
import { jsonRequestLogger, requestContext } from "./middleware/requestContext.js";
import { safeErrorHandler } from "./middleware/safeErrors.js";

const app = express();

app.disable("x-powered-by");
app.use(cors({ origin: true, credentials: true }));
app.use(requestContext);
app.use(jsonRequestLogger);

const globalLimiter = rateLimit({
  windowMs: 60_000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 60_000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(globalLimiter);

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "gateway" });
});

function forwardRequestId(
  proxyReq: { setHeader: (k: string, v: string) => void },
  req: { headers: { [k: string]: string | string[] | undefined } },
): void {
  const id = req.headers["x-request-id"];
  if (typeof id === "string" && id.length > 0) {
    proxyReq.setHeader("x-request-id", id);
  }
}

const loginProxyOn = {
  proxyReq: (
    proxyReq: { setHeader: (k: string, v: string) => void },
    req: Parameters<typeof forwardRequestId>[1],
  ) => {
    forwardRequestId(proxyReq, req);
  },
};

/** Express strips the mount prefix (`/auth`), so the proxy sees `/register` not `/auth/register`. */
const loginProxy = createProxyMiddleware({
  target: config.loginServerUrl,
  changeOrigin: true,
  pathRewrite: (path: string) => (path.startsWith("/auth") ? path : "/auth" + path),
  on: loginProxyOn,
});

/** Compat: POST /register e /login → mesmo que /auth/register e /auth/login (clientes antigos). */
const loginAliasProxy = createProxyMiddleware({
  target: config.loginServerUrl,
  changeOrigin: true,
  pathRewrite: {
    "^/register$": "/auth/register",
    "^/login$": "/auth/login",
  },
  on: loginProxyOn,
});

app.post("/register", authLimiter, loginAliasProxy);
app.post("/login", authLimiter, loginAliasProxy);

const combatProxy = createProxyMiddleware({
  target: config.combatServerUrl,
  changeOrigin: true,
  on: {
    proxyReq: (proxyReq, req) => {
      forwardRequestId(proxyReq, req);
    },
  },
});

const worldProxy = createProxyMiddleware({
  target: config.worldServerUrl,
  changeOrigin: true,
  ws: true,
  on: {
    proxyReq: (proxyReq, req) => {
      forwardRequestId(proxyReq, req);
    },
  },
});

app.use("/auth", authLimiter, loginProxy);
app.use("/combat", combatProxy);
app.use("/ws", worldProxy);

app.use(safeErrorHandler);

const server = app.listen(config.port, () => {
  console.log(
    JSON.stringify({
      msg: "gateway listening",
      port: config.port,
      env: config.nodeEnv,
    }),
  );
});

server.on("upgrade", (req, socket, head) => {
  worldProxy.upgrade(req, socket as Socket, head);
});
