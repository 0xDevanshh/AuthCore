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

const BASE62_ALPHABET =
  "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

const API_KEY_SECRET_BYTES = 32;

// ceil(256 / log2(62)) — fixed width so every key is the same length.
const API_KEY_SECRET_LENGTH = 43;

/**
 * Human-readable label carried by every secret API key.
 *
 * `live` distinguishes these from the test-mode keys a later phase will add;
 * the value is part of the stored prefix, so changing it invalidates the
 * ability to match existing keys by prefix.
 */
export const API_KEY_LABEL = "ac_live_";

/**
 * Characters of the secret body retained in the plaintext prefix. Eight
 * base62 characters (~48 bits) is enough to identify a key in a dashboard
 * while leaving ~208 bits of the secret undisclosed.
 */
const API_KEY_PREFIX_SECRET_CHARS = 8;

function toBase62(
  buffer: Buffer,
): string {
  let value = BigInt(
    `0x${buffer.toString("hex")}`,
  );

  let encoded = "";

  while (value > 0n) {
    encoded =
      BASE62_ALPHABET.charAt(
        Number(value % 62n),
      ) + encoded;

    value /= 62n;
  }

  return encoded.padStart(
    API_KEY_SECRET_LENGTH,
    BASE62_ALPHABET.charAt(0),
  );
}

export interface GeneratedApiKey {
  rawKey: string;
  hashedKey: string;
  prefix: string;
}

/**
 * Mints an API key.
 *
 * `rawKey` is returned to the caller once and never persisted — only
 * `hashedKey` (HMAC-SHA256, same construction as refresh tokens) and the
 * plaintext `prefix` reach the database.
 */
export function generateApiKey(): GeneratedApiKey {
  const secret = toBase62(
    randomBytes(
      API_KEY_SECRET_BYTES,
    ),
  );

  const rawKey = `${API_KEY_LABEL}${secret}`;

  return {
    rawKey,

    hashedKey:
      hashOpaqueToken(rawKey),

    prefix:
      apiKeyPrefixOf(rawKey),
  };
}

/**
 * Derives the stored prefix from a raw key, so an incoming key can be
 * matched against the indexed `prefix` column.
 *
 * Note this is the label plus the leading characters of the secret body —
 * not literally the first 8 characters of the key, which would be the
 * constant "ac_live_" and identify nothing.
 */
export function apiKeyPrefixOf(
  rawKey: string,
): string {
  return rawKey.slice(
    0,
    API_KEY_LABEL.length +
      API_KEY_PREFIX_SECRET_CHARS,
  );
}