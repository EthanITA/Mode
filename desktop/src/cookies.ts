import { execFileSync } from "node:child_process";
import { createDecipheriv, createHash, pbkdf2Sync } from "node:crypto";
import { copyFileSync, existsSync, mkdtempSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { Session } from "electron";

const SALT = "saltysalt";
const ITERATIONS = 1003;
const KEY_LENGTH = 16;
const IV = Buffer.alloc(16, 0x20);
// Seconds between the 1601 epoch Chrome counts from and the Unix epoch.
const EPOCH_OFFSET = 11_644_473_600;

interface CookieRow {
  encrypted_value: Uint8Array;
  expires_utc: number;
  host_key: string;
  is_httponly: number;
  is_secure: number;
  name: string;
  path: string;
  samesite: number;
}

export interface CookieImport {
  failed: number;
  set: number;
  skipped: number;
}

const SAME_SITE: Record<number, "lax" | "no_restriction" | "strict" | "unspecified"> = {
  [-1]: "unspecified",
  0: "no_restriction",
  1: "lax",
  2: "strict",
};

function profileDir(profile: string): string {
  return join(homedir(), "Library", "Application Support", "Google", "Chrome", profile);
}

// The one Keychain read that prompts macOS: Chrome's own storage key, from which the AES key is derived.
export function cookieKey(): Buffer {
  const password = execFileSync("security", ["find-generic-password", "-wa", "Chrome", "-s", "Chrome Safe Storage"], {
    encoding: "utf8",
  }).trim();
  return pbkdf2Sync(password, SALT, ITERATIONS, KEY_LENGTH, "sha1");
}

// A wrapper rather than a bare string, since a decrypted value of "" is valid and must read apart from a failed decrypt.
export interface Decrypted {
  value: string;
}

// From Chrome schema v24 the plaintext is SHA256(host_key) then the value, so the hash is stripped once it matches.
export function decryptCookie(encrypted: Uint8Array, key: Buffer, host: string): Decrypted | undefined {
  const blob = Buffer.from(encrypted);
  if (blob.subarray(0, 3).toString("latin1") !== "v10") return undefined;
  const cipher = createDecipheriv("aes-128-cbc", key, IV);
  let plain: Buffer;
  try {
    plain = Buffer.concat([cipher.update(blob.subarray(3)), cipher.final()]);
  } catch {
    return undefined;
  }
  const hash = createHash("sha256").update(host).digest();
  const body = plain.length >= 32 && plain.subarray(0, 32).equals(hash) ? plain.subarray(32) : plain;
  return { value: body.toString("utf8") };
}

function urlOf(row: CookieRow): string {
  return `${row.is_secure ? "https" : "http"}://${row.host_key.replace(/^\./, "")}${row.path || "/"}`;
}

function expiryOf(row: CookieRow): number | undefined {
  if (!row.expires_utc) return undefined;
  const seconds = row.expires_utc / 1_000_000 - EPOCH_OFFSET;
  return seconds > Date.now() / 1000 ? seconds : undefined;
}

export async function importChromeCookies(session: Session, { profile = "Default" }: { profile?: string }): Promise<CookieImport> {
  const db = join(profileDir(profile), "Cookies");
  if (!existsSync(db)) throw new Error(`no Chrome cookie database at ${db}`);
  const key = cookieKey();
  // A copy, since Chrome holds a lock on the live database while it runs.
  const copy = join(mkdtempSync(join(tmpdir(), "sidecar-cookies-")), "Cookies");
  copyFileSync(db, copy);
  const handle = new DatabaseSync(copy, { readOnly: true });
  const rows = handle
    .prepare("SELECT host_key, name, encrypted_value, path, is_secure, is_httponly, expires_utc, samesite FROM cookies")
    .all() as unknown as CookieRow[];
  handle.close();

  const out: CookieImport = { failed: 0, set: 0, skipped: 0 };
  for (const row of rows) {
    const got = decryptCookie(row.encrypted_value, key, row.host_key);
    if (!got) {
      out.skipped += 1;
      continue;
    }
    try {
      await session.cookies.set({
        domain: row.host_key,
        expirationDate: expiryOf(row),
        httpOnly: !!row.is_httponly,
        name: row.name,
        path: row.path,
        sameSite: SAME_SITE[row.samesite] ?? "unspecified",
        secure: !!row.is_secure,
        url: urlOf(row),
        value: got.value,
      });
      out.set += 1;
    } catch {
      out.failed += 1;
    }
  }
  return out;
}
