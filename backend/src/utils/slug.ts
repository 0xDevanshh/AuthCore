import { randomBytes } from "node:crypto";

const MAX_SLUG_LENGTH = 48;

const COMBINING_MARKS = new RegExp("[\\u0300-\\u036f]", "g");

/**
 * Converts a display name into a URL-safe slug body. May return an empty
 * string when the input carries no slug-able characters (e.g. "____").
 */
export function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(COMBINING_MARKS, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/^-+|-+$/g, "");
}

export function randomSlugSuffix(): string {
  return randomBytes(4).toString("hex");
}
