import { describe, expect, it } from "vitest";
import { checkNewPassword, generatePassword, hashPassword, verifyPassword } from "@/lib/auth/password";
import { signSession, verifySession } from "@/lib/auth/token";
import { SignJWT } from "jose";

describe("password hashing", () => {
  it("verifies the right password and rejects others", async () => {
    const hash = await hashPassword("correct horse battery");
    expect(hash.startsWith("scrypt$32768$8$1$")).toBe(true);
    expect(await verifyPassword("correct horse battery", hash)).toBe(true);
    expect(await verifyPassword("correct horse batterY", hash)).toBe(false);
    expect(await verifyPassword("", hash)).toBe(false);
  });

  it("salts every hash", async () => {
    const [a, b] = await Promise.all([hashPassword("same password here"), hashPassword("same password here")]);
    expect(a).not.toBe(b);
  });

  it("rejects malformed stored hashes", async () => {
    expect(await verifyPassword("x", "bcrypt$foo")).toBe(false);
    expect(await verifyPassword("x", "")).toBe(false);
  });

  it("checks new passwords", () => {
    expect(checkNewPassword("short").ok).toBe(false);
    expect(checkNewPassword("aaaaaaaaaaaa").ok).toBe(false);
    expect(checkNewPassword("1234567890").ok).toBe(false);
    expect(checkNewPassword("anvith-lifts-2026", "anvith.cloud@gmail.com").problems).toContain("Don't include your email name.");
    expect(checkNewPassword("plate-rack-bench-9").ok).toBe(true);
  });

  it("generates strong readable passwords", () => {
    const p = generatePassword();
    expect(p).toMatch(/^[A-Za-z0-9]{5}-[A-Za-z0-9]{5}-[A-Za-z0-9]{5}-[A-Za-z0-9]{5}$/);
    expect(checkNewPassword(p).ok).toBe(true);
    expect(new Set(Array.from({ length: 50 }, generatePassword)).size).toBe(50);
  });
});

describe("session tokens", () => {
  it("round-trips the user id and session version", async () => {
    const token = await signSession({ sub: "11111111-1111-1111-1111-111111111111", sv: 3 });
    expect(await verifySession(token)).toEqual({ sub: "11111111-1111-1111-1111-111111111111", sv: 3 });
  });

  it("rejects tampered, expired, foreign and empty tokens", async () => {
    const token = await signSession({ sub: "u", sv: 1 });
    const [h, p, s] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(p, "base64url").toString()), sv: 99 })).toString("base64url");
    expect(await verifySession(`${h}.${forged}.${s}`)).toBeNull();
    expect(await verifySession(await signSession({ sub: "u", sv: 1 }, -10))).toBeNull();
    const other = await new SignJWT({ sv: 1 })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("u")
      .setIssuer("lockdin")
      .setAudience("lockdin")
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode("a-completely-different-secret-value-1234"));
    expect(await verifySession(other)).toBeNull();
    expect(await verifySession("")).toBeNull();
    expect(await verifySession(undefined)).toBeNull();
    expect(await verifySession("not.a.jwt")).toBeNull();
  });

  it("rejects the unsigned 'none' algorithm", async () => {
    const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(
      JSON.stringify({ sub: "u", sv: 1, iss: "lockdin", aud: "lockdin", exp: Math.floor(Date.now() / 1000) + 3600 }),
    ).toString("base64url");
    expect(await verifySession(`${header}.${payload}.`)).toBeNull();
  });
});
