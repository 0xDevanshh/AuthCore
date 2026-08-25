import {
  createHmac,
  randomBytes,
} from "node:crypto";

import { env } from "../config/env.ts";

export function generateOpaqueToken(): string {
  return randomBytes(48).toString("base64url");
}

export function hashOpaqueToken(
  token: string,
): string {
  return createHmac(
    "sha256",
    env.TOKEN_HASH_SECRET,
  )
    .update(token)
    .digest("hex");
}