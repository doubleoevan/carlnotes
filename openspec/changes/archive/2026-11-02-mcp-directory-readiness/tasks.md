# Tasks

## 1. Origin protection

- [x] 1.1 Add the shared MCP Origin middleware using the production and configured application origins. Verify missing Origin passes and malformed, opaque, empty, multi-origin, lookalike, path-bearing, and unlisted-port values fail in focused unit tests.
- [x] 1.2 Mount the guard on both transport endpoints before caller resolution and limits. Add composed-app tests proving HTTP 403 precedes account work for every supported request method; verify consent and OAuth discovery remain reachable with `bun test apps/api/index.test.ts`.
- [x] 1.3 Reuse the guard in standalone smoke fixtures and add missing, allowed, and rejected Origin cases for both endpoints. Update `apps/api/AGENTS.md` for the new module and checks; verify the Origin section through `bun run smoke:mcp`.

## 2. Tool contracts and smoke regression gates

- [x] 2.1 Add a shared test matrix for all eleven advertised tools. Update the seven account tools to conservative destructive hints while retaining other hints. Prove missing titles, wrong boolean types, misclassified writes, and unexpected tools fail; verify with `bun test apps/api/mcp`.
- [x] 2.2 Extend smoke fixtures with isolated private Topics and verify authenticated access on both endpoints, visitor and invalid-bearer denials, and forbidden-Origin rejection with a valid token. Preserve PKCE, consent, writes, confirmations, cards, and rate-limit checks; pass `bun run smoke:mcp` without printing credentials.
- [x] 2.3 Add large-feed and 50-row search fixtures with explicit result bounds. Assert serialized text and structured sizes, full explanations, progressing cursors, complete traversal, and the existing oversized-item exception. Verify unit tests and `bun run smoke:mcp`, and prove seeded records are removed in cleanup.
- [x] 2.4 Document the new smoke coverage and pre-handoff requirement in README and the API guide. Verify `bun run smoke:mcp` remains selected by the existing Smoke workflow and that deterministic Origin and annotation assertions run under `bun run check`.

- [x] 2.5 Fix the shipping audit finding in subscribed Topic listing with the canonical account-access predicate. Add a live public-to-private regression with changed name, prompt, and Source data; retain public, invite, owner, and active-team access. Pass the MCP smoke and obtain security re-review.

## 3. Accurate MCP privacy disclosures

- [x] 3.1 Extend the OAuth smoke to exercise discovery and refresh-token revocation after authenticated checks. Verify a revoked refresh token cannot mint another token and document the already-issued JWT's actual behavior; pass `bun run smoke:mcp` with token values redacted from diagnostics.
- [x] 3.2 Add the MCP privacy section and update its last-updated date. Cover arguments, authorized results, assistant-data boundaries, OAuth credentials, real disconnect and revocation paths, token expiry, PostHog fields, and existing retention. Verify the text against source and the revocation smoke; extend the existing analytics assertion to prove arguments, results, and credentials are absent from `mcp_tool_called`.
- [x] 3.3 Review the policy diff and render at desktop and narrow widths. Verify every existing collection, use/storage, sharing, retention, deletion, and contact section remains intact. Record evidence for the hosted twelve-month analytics retention policy, or explicitly flag it unverified before any readiness claim.

## 4. Listing documentation

- [x] 4.1 Expand `account/add-to-ai.md` with current Claude and ChatGPT setup and Claude Code and Codex commands. Recheck official setup instructions, correct the shared Claude/ChatGPT paste copy where stale, and verify examples, sign-in, client restrictions, and disconnection guidance agree.
- [x] 4.2 Add the eleven-tool reference, identity and permission distinctions, side effects, pagination, budgets, confirmation behavior, and card fallback. Compare it against the complete advertised tool matrix and existing handler behavior; preserve the current screenshots and install URL.
- [x] 4.3 Update the docs guide's module description and run `bun run build:docs` and development `bun run docs:embed`. Verify the existing `/docs/account/add-to-ai/` URL, Account sidebar, search entry, privacy link, and desktop/narrow layouts.

## 5. Registry manifest

- [x] 5.1 Add root `server.json` using the design's remote-only candidate. Verify `com.carlnotes/carlnotes`, server version, production endpoint, description, documentation URL, and repository against the running server contract and Git origin; confirm no secrets, placeholders, or local package entries.
- [x] 5.2 Obtain an official `mcp-publisher` release and record its version. Run `mcp-publisher validate server.json` successfully, resolve or explain warnings, and document the exact command in README and the manifest in the root agent guide. Confirm no login, DNS change, or publication occurred.

## 6. Integration and readiness evidence

- [x] 6.1 Run `bun run check` after all implementation changes. Record a passing gate and any existing skips, with no source or main-spec changes outside the agreed scope.
- [x] 6.2 Run the final `bun run smoke:mcp`, docs build, and publisher validation on the final candidate. Retain outcomes, measured result bounds, revocation evidence, and any unverified operational claims in the change's validation record; run heavyweight checks sequentially and stop task-owned test processes between them.
- [x] 6.3 Run `openspec validate mcp-directory-readiness --strict` and reconcile tasks with delivered behavior. Before any main-spec operation, verify candidate paths and all existing parents stay within the real selected `openspec/specs/` directory. The hand-off must identify manual submissions and remaining operator evidence without claiming directory acceptance.

## Workflow follow-up

- Apply begins only after this proposal is reviewed and the user requests implementation.
- Finish implementation through `/ship`; archive through the OpenSpec CLI after repository review requirements are met.
- The operator uses the originating row's manual instructions for domain verification, reviewer credentials, directory screenshots and forms, publishing, and post-deploy URL checks.
