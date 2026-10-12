# Security

## Reporting a vulnerability

Report a vulnerability privately, never in a public issue. Either way below reaches the maintainers:

- GitHub's private vulnerability reporting, under this repository's Security tab, which opens a private advisory.
- Email to the contact in the site's [security.txt](https://carlnotes.com/.well-known/security.txt).

Expect an acknowledgement within three days and a fix or a plan within two weeks for anything confirmed. Please give
the maintainers that time before any public disclosure.

## What is in scope

The code in this repository and the deployment at carlnotes.com: the api, the ui, the worker, the MCP server, and the
services they run beside. The model providers, Stripe, Resend, and the other third parties the app calls are out of
scope here and have their own programs.

## How dependencies are checked

- Dependabot opens pull requests for the Bun lockfile, the workflow actions, and the image bases, and a security update
  as soon as GitHub publishes an advisory (`.github/dependabot.yml`).
- Every CI run audits the lockfile against the GitHub Advisory Database with `bun audit`, report-only, so an open
  advisory is visible on every CI run without blocking an unrelated push (`.github/workflows/ci.yml`).
- CodeQL analyzes the TypeScript on every push to main, every pull request into main, and weekly
  (`.github/workflows/codeql.yml`).
- Every workflow action is pinned to a commit, every image base to a digest, and a package version has to be three
  days old before an install picks it (`bunfig.toml`).
