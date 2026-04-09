import express from "express";
import { config } from "./config.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { zodErrorHandler } from "./middleware/validate.js";
import { postLogin, postRegister } from "./handlers/authHandlers.js";

const app = express();
app.use(express.json({ limit: "32kb" }));

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "login-server" });
});

app.post("/auth/register", postRegister);
app.post("/auth/login", postLogin);

app.use(zodErrorHandler);
app.use(errorHandler);

app.listen(config.port, () => {
  console.log(
    JSON.stringify({
      msg: "login-server listening",
      port: config.port,
      env: config.nodeEnv,
    }),
  );
});
