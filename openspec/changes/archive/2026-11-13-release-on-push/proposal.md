## Why

Releases waited on CI: Northflank's `release-main` workflow had no push trigger, and a CI job started it only after the
gate and the image smoke passed. A failing or slow check held every release back, and a misplaced
`NORTHFLANK_WORKFLOW_ID` variable stopped prod deploys for a day without any failure to show it.

## What Changes

- `release-main` gets its GitHub push trigger on `main` back, so every push to `main` releases without waiting for CI.
- The workflow builds the newest commit on `main`, and its `sha` argument is removed.
- CI's `release` job is removed. CI still runs the gate and the image smoke, and reports them, but releases no longer
  wait for them.
- The deployment guide describes the push trigger.

## Capabilities

### New Capabilities

### Modified Capabilities

- `deploy-mechanics`: a push to main starts the release, without waiting for CI.

## Impact

- `infra/northflank/release-main.json`, applied to Northflank with `northflank create workflow`
- `.github/workflows/ci.yml`
- `apps/docs/deployment.md`
