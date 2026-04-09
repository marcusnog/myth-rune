import express from "express";
import { Redis } from "ioredis";
import { config } from "./config.js";
import {
  combatErrorHandler,
  createPostAttack,
} from "./handlers/attackHandler.js";
import { zodErrorHandler } from "./middleware/validate.js";
import { genericErrorHandler } from "./middleware/errors.js";

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "16kb" }));

const redis = new Redis(config.redisUrl);

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "combat-server" });
});

app.post("/combat/attack", createPostAttack(redis));

app.use(zodErrorHandler);
app.use(combatErrorHandler);
app.use(genericErrorHandler);

app.listen(config.port, () => {
  console.log(
    JSON.stringify({
      msg: "combat-server listening",
      port: config.port,
      env: config.nodeEnv,
    }),
  );
});
