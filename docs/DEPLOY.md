# Going online

The same deployment path as Markus-AI (GitHub → Vercel, Supabase for the database),
with two differences: the app talks to Supabase's **Postgres** directly from the server
(no browser keys at all), and it has its own login instead of Supabase Auth.

What's needed from you:

| Token | Where | Used for |
|---|---|---|
| Supabase access token (`sbp_…`) | supabase.com/dashboard/account/tokens | create the `lockdin` project, apply the schema, read the pooler address |
| Vercel token | vercel.com/account/tokens (personal scope) | create the project, set its secrets, deploy, confirm the cron |

Paste them into `D:\Dev\LockdIn\.env.access.local` (gitignored).

## 1. Supabase

1. Create a project named `lockdin` in the region closest to India (Mumbai, `ap-south-1`),
   with a generated database password. The free plan allows two active projects; pause one
   if Markus-AI uses both.
2. Build the pooler connection string (Project Settings → Database → Connection pooling,
   **transaction** mode, port 6543):
   `postgresql://postgres.<ref>:<password>@aws-0-ap-south-1.pooler.supabase.com:6543/postgres`
3. Apply the schema from this PC:
   ```bash
   DATABASE_URL="<pooler url>" npm run db:migrate
   ```
   (or paste the output of `npm run db:migrate -- --print` into the SQL editor). This also
   enables Row Level Security on every table with no policies and revokes the Data API
   roles, so the project's public API exposes nothing.
4. Create your account in the online database:
   ```bash
   DATABASE_URL="<pooler url>" npm run user:create -- --email anvith.cloud@gmail.com --name Anvith
   ```
   The password goes to `owner.credentials.local.txt`. Nothing else is needed in Supabase:
   no Auth settings, no API keys in the app.

## 2. Vercel

1. Import `A-n-v-i-t-h/LockdIn` (private) as a Next.js project. If the Vercel GitHub app
   only sees selected repositories, add this one.
2. Environment variables (Production):
   | Name | Value |
   |---|---|
   | `DATABASE_URL` | the pooler URL from step 1.2 |
   | `SESSION_SECRET` | 32+ random characters (`node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`) |
   | `CRON_SECRET` | 24+ random characters; Vercel sends it to the cron route as a Bearer token |
3. Deploy. `vercel.json` schedules `GET /api/cron/morning` at **04:30 UTC** (10:00–11:00 IST
   on the Hobby plan, which allows one run a day). The check-in normally runs the coach
   first; the cron covers mornings without one, so the card is ready with the PC off.
4. Check: open the site, sign in, save a check-in, then in Vercel → Cron Jobs run the job
   once and confirm a 200 with `"failures": []`.

## 3. After deploying

- Add to the phone's home screen (Safari → Share → Add to Home Screen).
- Run the browser suite against the live site with a throwaway account if you want a
  post-deploy check; delete that account afterwards (`delete from app_users where email = …`
  removes everything it owns).
- Local development keeps using PGlite unless `DATABASE_URL` is set in `.env.local`.
