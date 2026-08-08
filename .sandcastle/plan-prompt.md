# ISSUES

Here are the open issues ready for agent work:

<issues-json>

!`gh issue list --repo Atypical-Playworks/impostoi --state open --label ready-for-agent --limit 100 --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'`

</issues-json>

# TASK

Analyze the ready issues and build a dependency graph. An issue is blocked when it requires code, infrastructure, a decision, or an API contract introduced by another open issue, or when concurrent work would modify overlapping files.

Select only unblocked issues. Assign each the deterministic branch name `sandcastle/issue-{id}`.

# OUTPUT

Return JSON wrapped in `<plan>` tags:

<plan>
{"issues":[{"id":"42","title":"Example","branch":"sandcastle/issue-42"}]}
</plan>

If no unblocked issue exists, return `<plan>{"issues":[]}</plan>`.
