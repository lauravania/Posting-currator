import { randomBytes } from "crypto";

export function randomId(len = 12): string {
  return randomBytes(len).toString("hex").slice(0, len);
}

export function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120);
}
