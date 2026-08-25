import pino from "pino";
import { env } from "./env.ts";

export const logger = pino({
  level: env.NODE_ENV === "production" ? "info" : "debug",

  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "password",
      "*.password",
      "refreshToken",
      "*.refreshToken",
      "accessToken",
      "*.accessToken",
    ],
    censor: "[REDACTED]",
  },
});