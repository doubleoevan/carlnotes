# Proposal

## Why

CarlNotes needs Origin validation, explicit MCP privacy disclosures, complete connection instructions, and registry metadata before directory submission. Persistent checks must catch regressions when its tools change.

## What Changes

- Reject a present, unapproved Origin with HTTP 403 on `/mcp` and `/mcp/t/:topicId`. Keep requests without Origin working under the existing authorization rules.
- Apply the existing account-access predicate to subscribed Topics in `list_topics`, so a former public follower cannot list private metadata after a visibility change. The shipping security review identified this existing leak.
- Allow the production origin and the configured deployment origin, including the local development origin. Document exact matching and why requiring Origin would break server-side clients.
- Add an MCP section to `/privacy`. Cover arguments, returned data, OAuth credentials and revocation limits, analytics fields, and the existing twelve-month analytics retention policy.
- Explain that MCP gives CarlNotes no access to an assistant's chat history, memory, or uploaded files. Distinguish that restriction from content deliberately sent as tool arguments.
- Expand the existing `/docs/account/add-to-ai/` page into the listing's documentation URL. Add explicit Claude, ChatGPT, and coding-agent setup, all eleven tools, permissions, and account connection instructions.
- Add root `server.json` for `com.carlnotes/carlnotes`, its production Streamable HTTP endpoint, version, description, and GitHub repository. Require `mcp-publisher validate server.json` to pass.
- Strengthen annotation, authentication, and result-size smoke checks on both endpoints. Mirror deterministic checks in the ordinary test gate.
- Align the seven account tools' hints with current Claude review guidance by marking them conservatively destructive. This changes client confirmation prompts, while tool names, arguments, results, and permissions remain stable.

## Capabilities

### New Capabilities

- `mcp-registry`: A validated, remote-only registry manifest with stable CarlNotes identity and manual publication.

### Modified Capabilities

- `mcp-server`: Origin checks, directory annotation contracts, regression gates, and accurate public MCP privacy disclosures. Reconcile the stale `suggest_sources` annotation requirement and the existing `follow_topic` hint.
- `docs-site`: A complete MCP connection and tool reference at the existing Add to AI URL.

## Impact

Implementation touches `apps/api/index.ts`, `apps/api/mcp/`, `apps/web/src/pages/PrivacyPage.tsx`, and `apps/docs/src/content/docs/account/add-to-ai.md`. Root `server.json`, relevant agent guides, and README validation instructions also change. Update the shared install instructions in `packages/core/lib/installDeeplinks.ts` where current Claude or ChatGPT setup differs.

Use existing Hono, Better Auth, MCP SDK, analytics, and docs infrastructure. No runtime dependency, database migration, new tool, token-revocation system, or card redesign is planned.

Directory forms, reviewer credentials, screenshots, domain ownership verification, and registry publishing remain manual in the originating row's instructions. This change neither submits nor publishes CarlNotes, and passing checks does not guarantee directory approval.
