import assert from "node:assert/strict";
import { createCipheriv, createHash, pbkdf2Sync } from "node:crypto";
import { test } from "node:test";
import { decryptCookie } from "./cookies.ts";

// Encrypts exactly as macOS Chrome does, so the test proves decryptCookie inverts the real format with no Keychain or real cookie.
function encrypt(value: string, key: Buffer, host?: string): Buffer {
  const iv = Buffer.alloc(16, 0x20);
  const prefix = host ? createHash("sha256").update(host).digest() : Buffer.alloc(0);
  const cipher = createCipheriv("aes-128-cbc", key, iv);
  const body = Buffer.concat([cipher.update(Buffer.concat([prefix, Buffer.from(value, "utf8")])), cipher.final()]);
  return Buffer.concat([Buffer.from("v10"), body]);
}

const key = pbkdf2Sync("test-password", "saltysalt", 1003, 16, "sha1");

test("strips the SHA256(host) prefix on a v24 cookie", () => {
  const host = ".example.com";
  assert.equal(decryptCookie(encrypt("session=abc", key, host), key, host)?.value, "session=abc");
});

test("reads a pre-v24 cookie that has no prefix", () => {
  assert.equal(decryptCookie(encrypt("plain", key), key, ".example.com")?.value, "plain");
});

test("keeps an empty value apart from a failed decrypt", () => {
  const host = ".x.com";
  assert.equal(decryptCookie(encrypt("", key, host), key, host)?.value, "");
});

test("skips a blob that is not v10", () => {
  assert.equal(decryptCookie(Buffer.from("v20something"), key, ".x.com"), undefined);
});
