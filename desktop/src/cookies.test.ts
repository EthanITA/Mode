import assert from "node:assert/strict";
import { createCipheriv, createHash, pbkdf2Sync } from "node:crypto";
import { test } from "node:test";
import { decryptCookie, setDetails } from "./cookies.ts";

type Row = Parameters<typeof setDetails>[0];

function row(over: Partial<Row>): Row {
  return { encrypted_value: new Uint8Array(), expires_utc: 0n, host_key: ".example.com", is_httponly: 0n, is_secure: 1n, name: "x", path: "/", samesite: 1n, ...over };
}

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

test("a __Host- cookie imports host-only, so cookies.set accepts it", () => {
  const o = setDetails(row({ name: "__Host-ant_trusted_device", host_key: "claude.ai", path: "/" }), "tok");
  assert.equal(o.domain, undefined);
  assert.equal(o.path, "/");
  assert.equal(o.secure, true);
  assert.equal(o.url, "https://claude.ai/");
});

test("a normal cookie keeps its domain", () => {
  assert.equal(setDetails(row({ name: "sessionKey", host_key: ".claude.ai" }), "tok").domain, ".claude.ai");
});
