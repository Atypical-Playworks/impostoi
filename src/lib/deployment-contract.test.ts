import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const workflow = readFileSync(
  join(process.cwd(), ".github/workflows/deploy.yml"),
  "utf8",
);
const documentation = readFileSync(
  join(process.cwd(), "docs/deployment.md"),
  "utf8",
);

describe("Cloud Run deployment contract", () => {
  test("validates configuration and applies migrations before deploying", () => {
    expect(workflow).toContain("Validate deployment configuration");
    expect(workflow).toContain("GCP_WORKLOAD_IDENTITY_PROVIDER");
    expect(workflow).toContain("DATABASE_URL_PROD");

    const migration = workflow.indexOf("supabase db push --db-url");
    const deployment = workflow.indexOf("gcloud run deploy");
    expect(migration).toBeGreaterThan(-1);
    expect(deployment).toBeGreaterThan(migration);
  });

  test("keeps production database credentials out of the image and runtime", () => {
    expect(workflow).not.toContain("DATABASE_URL=$");
    expect(workflow).not.toContain("DATABASE_URL_PROD=$");
    expect(workflow).toContain(
      "SUPABASE_SECRET_KEY=impostoi-supabase-secret-key:latest",
    );
    expect(workflow).toContain("PORTAL_SECRET=impostoi-portal-secret:latest");
    expect(workflow).toContain(
      "OPENCODE_ZEN_API_KEY=impostoi-opencode-zen-key:latest",
    );
  });

  test("does not interpolate configuration secrets into the deploy shell", () => {
    const deployStep = workflow.slice(workflow.indexOf("Deploy Cloud Run service"));

    expect(deployStep).toContain("APP_URL: ${{ secrets.NEXT_PUBLIC_APP_URL }}");
    expect(deployStep).toContain("NEXT_PUBLIC_APP_URL=$APP_URL");
    expect(deployStep).not.toContain(
      "NEXT_PUBLIC_APP_URL=${{ secrets.NEXT_PUBLIC_APP_URL }}",
    );
  });

  test("documents required GitHub configuration and Google permissions", () => {
    for (const name of [
      "GCP_WORKLOAD_IDENTITY_PROVIDER",
      "GCP_DEPLOYER_SERVICE_ACCOUNT",
      "DATABASE_URL_PROD",
      "NEXT_PUBLIC_APP_URL",
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      "NEXT_PUBLIC_PORTAL_KEY",
    ]) {
      expect(documentation).toContain(`\`${name}\``);
    }

    expect(documentation).toContain("roles/run.admin");
    expect(documentation).toContain("roles/secretmanager.secretAccessor");
    expect(documentation).toContain("roles/iam.serviceAccountUser");
  });
});
