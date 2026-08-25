import express from "express";

import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { pinoHttp } from "pino-http";

import { env } from "./config/env.ts";
import { logger } from "./config/logger.ts";

import {
  router,
} from "./routes/index.ts";

import {
  errorHandler,
} from "./middleware/error.middleware.ts";

export const app =
  express();

app.disable(
  "x-powered-by",
);

if (
  env.TRUST_PROXY > 0
) {
  app.set(
    "trust proxy",
    env.TRUST_PROXY,
  );
}

app.use(
  pinoHttp({
    logger,
  }),
);

app.use(
  helmet(),
);

app.use(
  cors({
    origin:
      env.FRONTEND_URL,

    credentials: true,

    methods: [
      "GET",
      "POST",
      "PUT",
      "PATCH",
      "DELETE",
      "OPTIONS",
    ],
  }),
);

app.use(
  express.json({
    limit: "32kb",
  }),
);

app.use(
  cookieParser(),
);

app.use(
  "/api/v1",
  router,
);

app.use(
  (_req, res) => {
    res.status(404).json({
      success: false,

      message:
        "Route not found",
    });
  },
);

app.use(
  errorHandler,
);