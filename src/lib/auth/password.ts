import { randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from "node:crypto";

// scrypt with N=2^15, r=8, p=1 (~32 MB, ~60 ms). Format: scrypt$N$r$p$salt$hash (base64url).
const N = 32768;
const R = 8;
const P = 1;
const KEY_LEN = 32;
const MAXMEM = 128 * N * R * 2;

function scrypt(password: string, salt: Buffer, keylen: number, opts: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(password.normalize("NFKC"), salt, keylen, opts, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, KEY_LEN, { N, r: R, p: P, maxmem: MAXMEM });
  return ["scrypt", N, R, P, salt.toString("base64url"), key.toString("base64url")].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, saltB64, keyB64] = parts;
  const expected = Buffer.from(keyB64, "base64url");
  const key = await scrypt(password, Buffer.from(saltB64, "base64url"), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: 128 * Number(n) * Number(r) * 2,
  });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/** Hash of a random password, used to keep timing equal when the email is unknown. */
let dummyHash: Promise<string> | undefined;
export function getDummyHash(): Promise<string> {
  dummyHash ??= hashPassword(randomBytes(18).toString("base64url"));
  return dummyHash;
}

export interface PasswordCheck {
  ok: boolean;
  problems: string[];
}

export function checkNewPassword(password: string, email?: string): PasswordCheck {
  const problems: string[] = [];
  if (password.length < 10) problems.push("Use at least 10 characters.");
  if (password.length > 200) problems.push("Use at most 200 characters.");
  if (/^(.)\1+$/.test(password)) problems.push("Don't repeat one character.");
  if (email) {
    const names = email.split("@")[0].toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 4);
    if (names.some((n) => password.toLowerCase().includes(n))) problems.push("Don't include your email name.");
  }
  if (["password12", "1234567890", "qwertyuiop", "lockdin123"].includes(password.toLowerCase())) {
    problems.push("That password is too common.");
  }
  return { ok: problems.length === 0, problems };
}

/** A readable random password: four groups of five characters. */
export function generatePassword(): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(20);
  const chars = Array.from(bytes, (b) => alphabet[b % alphabet.length]);
  return [0, 5, 10, 15].map((i) => chars.slice(i, i + 5).join("")).join("-");
}
