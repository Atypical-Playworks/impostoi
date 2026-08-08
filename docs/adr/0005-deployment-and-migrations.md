# Deployment and migrations

Status: Accepted

The application deploys as a standalone Next.js container to Google Cloud Run in the existing `angelic-throne-502610-v3` project. GitHub Actions uses repository-scoped Workload Identity Federation for `Atypical-Playworks/impostoi`.

Supabase migrations live under `supabase/migrations/` with timestamped filenames. Production migration execution is a separate deployment step using `DATABASE_URL_PROD` from GitHub Actions. The database URL and all server-only secrets remain outside the repository and Docker image.

Cloud Run receives server-only values from Google Secret Manager. Public Supabase and Portal keys may be normal runtime environment variables. No TikTok, Roblox, or Minecraft integration is required for the MVP.
