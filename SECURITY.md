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
  for an advisory on a package a workspace declares (`.github/dependabot.yml`). Its security updates do not see
  transitive packages. It ignores the four packages the root `package.json` patches, in a security update too, so no
  update drops a patch.
- Every CI run checks the lockfile against the GitHub Advisory Database with `bun run check:advisories`, in a job of
  its own. The job fails on a high or critical advisory that the reviewed allowlist in `dependency-advisories.json`
  does not name, and on an allowlist entry that matches no advisory. It also fails if the lockfile installs a zod that
  the allowlisted zod advisory covers anywhere but under `expo-mcp` or `@expo/mcp-tunnel`. Each entry names the
  advisory, its package, the reason it does not apply, and the date it was reviewed. A moderate or low advisory does
  not fail the job, and no release waits on it (`.github/workflows/ci.yml`). The check reads the lockfile, so it does
  not see a copy that a package ships inside its own build: posthog-js includes DOMPurify 3.4.13 in its built module.
- `bun run check` fails if `.bun-version` differs from the Dockerfile's Bun tag, or if a patched package is not
  installed at its patched version. It also fails if `docker-compose.yml` runs another LiteLLM image, by tag or
  digest, than `infra/litellm/Dockerfile` starts from (`scripts/check-dependency-pins.ts`).
- CodeQL analyzes the TypeScript on every push to main, every pull request into main, and weekly
  (`.github/workflows/codeql.yml`).
- Every workflow action is pinned to a commit, every image base to a digest, and a package version has to be three
  days old before an install picks it (`bunfig.toml`).
