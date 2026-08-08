# Issue tracker: GitHub

Issues and PRDs for `impostoi` live in GitHub Issues at `Atypical-Playworks/impostoi`.

Use the GitHub CLI for tracker operations:

- Create: `gh issue create --repo Atypical-Playworks/impostoi --title "..." --body-file "..."`
- Read: `gh issue view <number> --repo Atypical-Playworks/impostoi --comments`
- List: `gh issue list --repo Atypical-Playworks/impostoi --state open --limit 100 --json number,title,body,labels,comments`
- Comment: `gh issue comment <number> --repo Atypical-Playworks/impostoi --body "..."`
- Edit labels: `gh issue edit <number> --repo Atypical-Playworks/impostoi --add-label "..."`
- Close: `gh issue close <number> --repo Atypical-Playworks/impostoi --comment "..."`

PRs are a delivery surface, not a substitute for the issue specification. A PR must link its issue and describe verification.

The repository is public. Do not include credentials, private tokens, or unneeded personal data in issues, PRs, logs, screenshots, or fixtures.
