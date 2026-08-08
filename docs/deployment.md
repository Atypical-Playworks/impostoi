# Production deployment

The `Deploy to Cloud Run` workflow deploys the standalone Next.js container to
Cloud Run in `angelic-throne-502610-v3`. It runs for pushes to `main` and for
manual dispatches. The workflow validates configuration, runs the application
checks, builds and pushes an immutable commit-tagged image, applies Supabase
migrations, and then deploys that image.

## GitHub configuration

Configure these in the repository's `production` environment. Values marked
as secrets must not be committed or printed in workflow logs.

### Variables

| Name | Purpose |
| --- | --- |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | Full resource name of the repository-scoped Google Workload Identity Federation provider |
| `GCP_DEPLOYER_SERVICE_ACCOUNT` | Google service account used by GitHub Actions |

### Secrets

| Name | Purpose |
| --- | --- |
| `DATABASE_URL_PROD` | Supabase Postgres connection URL used only by `supabase db push` |
| `NEXT_PUBLIC_APP_URL` | Public application URL passed to Cloud Run |
| `NEXT_PUBLIC_SUPABASE_URL` | Public Supabase URL passed to Cloud Run |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Public Supabase publishable key passed to Cloud Run |
| `NEXT_PUBLIC_PORTAL_KEY` | Public Portal key passed to Cloud Run |

The workflow expects these Google Secret Manager secrets to exist:

- `impostoi-supabase-secret-key`
- `impostoi-portal-secret`
- `impostoi-opencode-zen-key`

They are injected into Cloud Run as `SUPABASE_SECRET_KEY`, `PORTAL_SECRET`,
and `OPENCODE_ZEN_API_KEY`. `DATABASE_URL_PROD` is never passed to Cloud Run,
Docker, or the built image.

## Google Cloud permissions

The deployer service account needs:

- `roles/artifactregistry.writer` on the `impostoi-registry` repository
- `roles/run.admin` on the project
- `roles/secretmanager.secretAccessor` on the three runtime secrets
- `roles/iam.serviceAccountUser` for the Cloud Run runtime service account
- `roles/serviceusage.serviceUsageConsumer` on the project

The Workload Identity Provider must restrict access to the
`Atypical-Playworks/impostoi` repository and grant that principal permission to
impersonate `GCP_DEPLOYER_SERVICE_ACCOUNT`.

Supabase migrations are timestamped files under `supabase/migrations/` and run
before the Cloud Run revision deployment. A failed preflight or migration stops
the workflow before a new revision is deployed.
