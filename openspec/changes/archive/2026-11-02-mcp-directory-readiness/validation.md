# Validation record

The implementation is on `codex/mcp-directory-readiness`, based on `d48b5d41bb0f79e7c396ff07ace925226080bb23`.
Validation uses the CarlNotes development environment. No directory submission, registry login, publication, DNS
change, reviewer account, or production embedding sync has been performed.

## Runtime evidence

- Both MCP endpoints reject foreign, empty, and opaque Origins. Valid account credentials do not bypass the guard.
  Missing Origin, the production origin, and the configured application origin initialize and list tools.
- Composed-app tests verify rejection before credential lookup and rate limiting for POST, GET, HEAD, OPTIONS, and
  DELETE. Consent and OAuth discovery retain their existing routing. Allowed Origin grants no account permissions.
- The same eleven-tool matrix passes for visitors, invalid bearers, and the fixture owner on both endpoints.
  Visitors and invalid tokens cannot read the private fixture Topic. Existing writes, confirmations, cards, and
  rate-limit assertions remain in the smoke suite.
- Forty-five Findings traverse six pages on each endpoint. The first page reaches 20 items; later pages reach the
  character budget. IDs and full explanations match the seeded order exactly, without duplicate or repeated cursors.
- The largest measured feed page is 38,567 characters in each model-visible representation, 77,134 combined.
  Card metadata is measured separately, at 40,438 characters for that page.
- Search returns 50 results followed by one result. Its first page measures 6,306 text characters and 22,854
  structured characters, 29,160 combined; card metadata measures 209 characters.
- Each ordinary text or structured fixture result stays within 41,024 characters: the existing 40,000-character item
  budget plus 1,024 for the envelope. These are fixture bounds, not universal token limits. The explicit unit test
  preserves a single oversized Finding whole and advances its cursor.
- OAuth discovery advertises the token and revocation endpoints. The issued refresh token successfully rotates.
  Revoking its replacement succeeds; reusing it returns HTTP 400 with `invalid_grant`. The original access JWT still
  resolves to its account after refresh revocation. No credential or authorization-code values are in this report.
- Cleanup verifies that the extra Topics, Resources, profiles, and owner are gone. The fixture owner uses Plus so
  the added access and pagination fixtures leave room for the existing `create_topic` regression.
- The shipping security review found a pre-existing private-metadata leak in subscribed Topic listing. The fix
  reuses `toTopicAccessFilter` inside the existing SQL query. A real OAuth follower loses both list and feed access
  when the foreign-owned Topic becomes private; changed name, prompt, and Source sentinels are absent. Public reads
  below the discovery threshold, invite subscriptions, owner access, and active-team access still pass. The extra
  Team is removed during cleanup. Security re-review confirms the leak is closed; performance re-review found no
  additional query calls or per-row I/O.

## Documentation and policy

- The original privacy policy remains byte-for-byte intact after excluding the inserted MCP section and updated date.
- `/privacy` and `/docs/account/add-to-ai/` return HTTP 200 at 1440px and 390px, with no browser page errors or document
  overflow. The narrow tool table scrolls horizontally. All eleven rows, both existing screenshots, sidebar entry,
  and privacy anchor remain available.
- Searching the built docs for `Codex` finds Add to AI, its Codex section, and its disconnect section.
- `bun run build:docs` builds 20 pages and the Pagefind index. Development `bun run docs:embed` syncs 129 sections,
  embedding nine changed sections initially and one after the final wording cleanup, deleting none.
- Client setup labels were rechecked on November 2, 2026 against the official sources linked in the guide.
- Hosted PostHog retention remains **unverified**. The source proves the event fields and the existing up-to-twelve-month
  policy, not the provider's configured retention. The operator must supply that evidence before a directory-readiness claim.

## Registry validation

The official `mcp-publisher` release is **1.8.7**, commit `741d575fc2ffe774fa51f442ec6fb2987dd03e18`, built October 30, 2026.
The macOS ARM archive's SHA-256 matches the release digest:
`b63dc083beb27e1a44c07c252ac147ff2c34af2f7822f705a17f8d0e1b44d592`.

```sh
mcp-publisher --version
mcp-publisher validate server.json
```

Validation exits 0 with `server.json is valid` and no warnings. The temporary executable is outside the repository;
no dependency or publishing workflow was added. The manifest uses the production common endpoint and the Git origin's
repository, with server version `1.0.0`.

## Required commands

The final focused suite passes **80 tests** with 248 assertions. The repository gate passes **3,198 tests across 535 files**, with
14,609 assertions and no failures or skips. The final live MCP smoke exits 0, including invalid-bearer write
denials. Biome, TypeScript, the comment-group hooks, and strict OpenSpec validation also pass.

The DRY pass removed an older duplicate inventory assertion from the unit and smoke suites. Both retain the stronger
shared eleven-tool contract that passed the live smoke. This removed one unit test without reducing tool coverage.

Use `DOPPLER_PROJECT=carlnotes DOPPLER_CONFIG=dev` for commands that require secrets in this worktree, which has no
directory-scoped Doppler default. This selects development without changing global configuration.

```sh
bun test apps/api/mcp apps/api/index.test.ts
bun run check
DOPPLER_PROJECT=carlnotes DOPPLER_CONFIG=dev bun run smoke:mcp
bun run build:docs
DOPPLER_PROJECT=carlnotes DOPPLER_CONFIG=dev bun run docs:embed
mcp-publisher validate server.json
openspec validate mcp-directory-readiness --strict
```

Heavy builds and smoke checks run sequentially. Temporary browser contexts, the API, the Temporal worker, and the
task-started Docker services are stopped between validation phases. Native simulators are unnecessary for this API,
documentation, and shared instruction-copy change.

## Manual operator work

Follow the originating row's manual instructions for `com.carlnotes` domain proof, registry publication, directory
forms, reviewer credentials, screenshots, and post-deploy public URL checks. Confirm hosted analytics retention.
Passing local checks does not establish directory acceptance.
