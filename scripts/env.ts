// Loads .env.local and .env for scripts (Next.js does this for the app itself).
import fs from "node:fs";
import path from "node:path";

export function loadEnv(files = [".env.local", ".env"]): void {
  for (const f of files) {
    const p = path.resolve(process.cwd(), f);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (!m || line.trim().startsWith("#")) continue;
      const [, key, raw] = m;
      if (process.env[key] !== undefined) continue;
      process.env[key] = raw.replace(/^["']|["']$/g, "");
    }
  }
}

export function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0) return process.argv[i + 1];
  const pre = process.argv.find((a) => a.startsWith(`--${name}=`));
  return pre?.slice(name.length + 3);
}
