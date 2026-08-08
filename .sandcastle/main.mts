import { execFile } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import * as sandcastle from "@ai-hero/sandcastle";
import { docker } from "@ai-hero/sandcastle/sandboxes/docker";

const exec = promisify(execFile);
const MAX_PARALLEL = 2;
const MODEL = "openai/gpt-5.6-luna";

const githubToken =
  process.env.GH_TOKEN ?? (await exec("gh", ["auth", "token"])).stdout.trim();

const sandboxProvider = () =>
  docker({
    env: {
      GH_TOKEN: githubToken,
    },
    mounts: [
      {
        hostPath: join(homedir(), ".local", "share", "opencode", "auth.json"),
        sandboxPath: "/home/agent/.local/share/opencode-auth-source.json",
        readonly: true,
      },
    ],
  });

const agent = () =>
  sandcastle.opencode(MODEL, {
    agent: "build",
  });

const hooks = {
  sandbox: {
    onSandboxReady: [
      {
        command:
          "mkdir -p ~/.local/share/opencode && cp ~/.local/share/opencode-auth-source.json ~/.local/share/opencode/auth.json && chmod 600 ~/.local/share/opencode/auth.json",
      },
      { command: "bun install --frozen-lockfile" },
    ],
  },
};

const listed = await exec("gh", [
  "issue",
  "list",
  "--repo",
  "Atypical-Playworks/impostoi",
  "--state",
  "open",
  "--label",
  "ready-for-agent",
  "--limit",
  "100",
  "--json",
  "number,title,body,labels",
]);

type Issue = {
  number: number;
  title: string;
  body: string;
  labels: { name: string }[];
};

function extractBlockers(body: string): string[] {
  const marker = "## Blocked by";
  const markerIndex = body.indexOf(marker);
  if (markerIndex === -1) return [];

  const tail = body.slice(markerIndex + marker.length);
  const nextSectionIndex = tail.search(/\n##\s/);
  const section =
    nextSectionIndex === -1 ? tail : tail.slice(0, nextSectionIndex);
  return [...section.matchAll(/#(\d+)/g)].flatMap((match) =>
    match[1] ? [match[1]] : [],
  );
}

const candidates = (JSON.parse(listed.stdout) as Issue[])
  .filter((issue) =>
    issue.labels.some((label) => label.name === "ready-for-agent"),
  )
  .sort((a, b) => a.number - b.number);

const blockerIds = [
  ...new Set(candidates.flatMap((issue) => extractBlockers(issue.body))),
];
const blockerStates = new Map<string, string>();

await Promise.all(
  blockerIds.map(async (id) => {
    const viewed = await exec("gh", [
      "issue",
      "view",
      id,
      "--repo",
      "Atypical-Playworks/impostoi",
      "--json",
      "state",
    ]);
    blockerStates.set(
      id,
      (JSON.parse(viewed.stdout) as { state: string }).state,
    );
  }),
);

const issues = candidates
  .filter((issue) =>
    extractBlockers(issue.body).every(
      (id) => blockerStates.get(id) === "CLOSED",
    ),
  )
  .slice(0, MAX_PARALLEL)
  .map((issue) => ({
    id: String(issue.number),
    title: issue.title,
    branch: `sandcastle/issue-${issue.number}`,
  }));

if (issues.length === 0) {
  console.log("No unblocked issues ready for agent work.");
  process.exit(0);
}

console.log(`Running ${issues.length} issue pipeline(s):`);
for (const issue of issues) {
  console.log(`  #${issue.id}: ${issue.title} -> ${issue.branch}`);
}

const settled = await Promise.allSettled(
  issues.map(async (issue) => {
    const sandbox = await sandcastle.createSandbox({
      branch: issue.branch,
      sandbox: sandboxProvider(),
      hooks,
    });

    try {
      const implementation = await sandbox.run({
        agent: agent(),
        name: `implement-${issue.id}`,
        maxIterations: 100,
        idleTimeoutSeconds: 1_800,
        promptFile: "./.sandcastle/implement-prompt.md",
        promptArgs: {
          TASK_ID: issue.id,
          ISSUE_TITLE: issue.title,
          BRANCH: issue.branch,
        },
      });

      if (implementation.commits.length === 0) {
        throw new Error(
          `Issue #${issue.id} produced no implementation commit.`,
        );
      }

      const review = await sandbox.run({
        agent: agent(),
        name: `review-${issue.id}`,
        maxIterations: 1,
        idleTimeoutSeconds: 1_800,
        promptFile: "./.sandcastle/review-prompt.md",
        promptArgs: { BRANCH: issue.branch },
      });

      return { issue, commits: [...implementation.commits, ...review.commits] };
    } finally {
      await sandbox.close();
    }
  }),
);

const completed = settled.flatMap((outcome) =>
  outcome.status === "fulfilled" && outcome.value.commits.length > 0
    ? [outcome.value.issue]
    : [],
);

for (const outcome of settled) {
  if (outcome.status === "rejected") {
    console.error("Pipeline failed:", outcome.reason);
  }
}

if (completed.length > 0) {
  await sandcastle.run({
    hooks,
    sandbox: sandboxProvider(),
    name: "merge-completed-issues",
    maxIterations: 1,
    agent: agent(),
    promptFile: "./.sandcastle/merge-prompt.md",
    promptArgs: {
      BRANCHES: completed.map((issue) => `- ${issue.branch}`).join("\n"),
      ISSUES: completed
        .map((issue) => `- ${issue.id}: ${issue.title}`)
        .join("\n"),
    },
  });

  for (const issue of completed) {
    await exec("gh", [
      "issue",
      "close",
      issue.id,
      "--repo",
      "Atypical-Playworks/impostoi",
      "--comment",
      "Implemented, reviewed, and merged by Sandcastle.",
    ]);
  }
}
