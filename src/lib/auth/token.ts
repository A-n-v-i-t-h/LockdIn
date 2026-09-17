// Session token: an HS256 JWT in an httpOnly cookie. It carries the user id and a
// session version; bumping the version in the database (password change,
// "sign out everywhere") invalidates every older cookie.
import { SignJWT, jwtVerify } from "jose";

export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

export interface SessionClaims {
  sub: string;
  sv: number;
}

function secretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    if (process.env.NODE_ENV === "production" && process.env.VERCEL) {
      throw new Error("SESSION_SECRET must be set to at least 32 characters.");
    }
    // Local development only: a fixed key so sessions survive restarts.
    return new TextEncoder().encode("local-development-only-secret-do-not-deploy!!");
  }
  return new TextEncoder().encode(secret);
}

export async function signSession(claims: SessionClaims, ttlSeconds = SESSION_TTL_SECONDS): Promise<string> {
  return new SignJWT({ sv: claims.sv })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setIssuer("lockdin")
    .setAudience("lockdin")
    .setExpirationTime(`${ttlSeconds}s`)
    .sign(secretKey());
}

export async function verifySession(token: string | undefined | null): Promise<SessionClaims | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      algorithms: ["HS256"],
      issuer: "lockdin",
      audience: "lockdin",
    });
    if (typeof payload.sub !== "string" || typeof payload.sv !== "number") return null;
    return { sub: payload.sub, sv: payload.sv };
  } catch {
    return null;
  }
}

export const SESSION_COOKIE = process.env.NODE_ENV === "production" ? "__Host-lockdin" : "lockdin_session";
