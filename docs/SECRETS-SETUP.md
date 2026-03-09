# Required GitHub Secrets

Setup checklist for the CI/CD pipeline on **EtheonAI/jeriko**.

## Required Secrets (workflows fail without these)

| Secret | Used By | How to Get |
|--------|---------|------------|
| `CLOUDFLARE_API_TOKEN` | deploy-relay.yml, release.yml (CDN upload) | CF Dashboard > My Profile > API Tokens > Create Token > "Edit Cloudflare Workers" template |
| `CLOUDFLARE_ACCOUNT_ID` | deploy-relay.yml, release.yml (CDN upload) | CF Dashboard > any domain > right sidebar "Account ID" (`fcbfb5e1eedee3ce3651c3b263e5c0dd`) |

## Future Secrets (when website deploy is configured)

| Secret | Used By | How to Get |
|--------|---------|------------|
| `VERCEL_TOKEN` | website.yml | Vercel Dashboard > Settings > Tokens |
| `VERCEL_ORG_ID` | website.yml | `.vercel/project.json` after `vercel link` |
| `VERCEL_PROJECT_ID` | website.yml | `.vercel/project.json` after `vercel link` |

## Automatically Provided (no setup needed)

| Secret | Used By |
|--------|---------|
| `GITHUB_TOKEN` | release.yml (create release), labeler.yml, stale.yml |

## GitHub Environments

Create a `production` environment in **Settings > Environments** with optional required reviewers. Used by:
- `deploy-relay.yml` deploy job
- `website.yml` deploy job

## Setting Secrets

```bash
# Via GitHub CLI
gh secret set CLOUDFLARE_API_TOKEN --repo EtheonAI/jeriko
gh secret set CLOUDFLARE_ACCOUNT_ID --repo EtheonAI/jeriko
```

## Verification

After setting secrets, verify each workflow:

1. **CI** — push to main or open a PR
2. **Deploy Relay** — push a change to `apps/relay-worker/` on main
3. **Release** — tag and push: `git tag v2.0.0-alpha.2 && git push --tags`
4. **Security** — runs on push to main and weekly
5. **Website** — push a change to `apps/website/` or trigger manually

## Build-Time Secrets (Baked OAuth IDs)

The build script (`scripts/build.ts`) bakes OAuth client IDs at compile time via `define` flags. These are NOT GitHub secrets — they are non-sensitive client IDs set as environment variables in the build environment:

- `BAKED_GITHUB_CLIENT_ID`, `BAKED_X_CLIENT_ID`, `BAKED_GDRIVE_CLIENT_ID`, etc.
- `BAKED_RELAY_AUTH_SECRET` — relay authentication (env overridable at runtime)
- `BAKED_POSTHOG_KEY` — telemetry key

For local builds, these default to empty strings. For release builds, set them in the GitHub Actions environment or as repository secrets.
