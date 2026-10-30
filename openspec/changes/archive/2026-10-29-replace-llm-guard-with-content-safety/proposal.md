# Proposal

## Why

LLM Guard is a scanner that has to fail open, so it adds latency without adding a guarantee. Protect AI archived the
upstream repository on July 9, 2026, and production has run without it since September. The defense that holds is
structural: the per-call nonce fence, Zod-locked outputs, model calls with no tools, and allowlisted links. That defense
should be the whole design, written down as current state, with no scanner code beside it.

Explicit and toxic content is a separate gap. Exa search is the only Source that screens adult content today
(`moderation: true`). Every other Source passes such content to the scorer, and the scorer passes it into Findings. An
image a user uploads, an avatar or a picture shared to a team room, reaches other users with no check, because the
moderation shipped in `c9505691` reads text only. Today the report button is the only backstop.

## What Changes

**Part 1: remove LLM Guard (BREAKING for any deployment that sets `LLM_GUARD_URL`)**

- Delete `packages/models/guard.ts`, `guard.test.ts`, `guardTestFixtures.ts`, and `imageText.ts`, the text recognition
  that only the scanner used, along with its dependency. Remove every call site: scoring, the attachment processing
  workflow, the private chat and room attachment paths, and the url Source screen.
- The url Source screen remains as a fetch-only check. A page that cannot be read still fails its Source and tells the
  owner. A readable page becomes ready with no content judgment.
- Attachments stop being screened and stop having personal details redacted. Their text reaches every prompt inside the
  nonce fence, the way it already does whenever the scanner is unset.
- Delete `infra/llm-guard/`, the `llm-guard` service in `docker-compose.yml`, `.github/workflows/llm-guard-update.yml`,
  `scripts/check-llm-guard-update.sh`, the scanner image entry in `.github/dependabot.yml`, the scanner lines in
  `scripts/carl-up.sh` and `smoke.yml`, and the `LLM_GUARD_URL`, `LLM_GUARD_TIMEOUT_MS`, and
  `LLM_GUARD_INJECTION_THRESHOLD` settings.
- Delete the review-pipeline eval's `--guard-only` mode, `reviewPipelineScanner.ts`, the `images/` fixtures, and the
  `injectionProse` and `injectionAttacks` sets with their two rates. The precision, recall, and cost harness stays.
- Rewrite the README's "Content screening (LLM Guard)" section, which is where the injection design is documented (the
  repository has no `ARCHITECTURE.md`), along with its diagrams, the AGENTS.md files, and `evals/README.md`. They
  describe the structural injection defense and the new content safety layers as current state.

**Part 2: content safety**

- **Source flags.** The Reddit ingester skips a post marked `over_18`. The X ingester skips a tweet marked possibly
  sensitive. The Bluesky ingester skips a post labeled `porn`, `sexual`, `nudity`, or `graphic-media`.
- **Scorer safety field.** The relevance scoring output in `summarize-resource.md` gains an `isUnsafe` field for content
  that is sexually explicit, hateful, harassing, or violent. Both tiers return it, so it adds no model call. A flagged
  Resource is marked unsafe and never becomes a Finding. A chat link to that Resource's url gets no preview image.
- **Image moderation.** A new `OPENAI_API_KEY` enables OpenAI's free `omni-moderation-latest` endpoint for images that
  other users see: an uploaded avatar, and an image shared to a team room. A flagged image is rejected with the
  existing 422 in Carl's voice. Moderation fails open on an unset key, a timeout, or an outage.
- **Topic tags.** The existing text classification of an invite or public Topic's name and prompt also reads its tags.

Settled with the user before design: the shipped LLM text classification stays as the text check, and omni-moderation
covers images only. A flagged invite or public Topic keeps getting the 422 rejection and stays private. No Topic can opt
in to sensitive subjects. A flagged chat message keeps getting rejected with its draft kept. Profile bios are out of
scope, since no bio field exists.

## Capabilities

### New Capabilities

- `resource-safety`: what keeps explicit, hateful, harassing, or violent content found by a Scan out of Findings and
  link previews. It covers each Source's own sensitivity flags and the scorer's safety field.

### Modified Capabilities

- `injection-defense`: removes the scanner sidecar, its fail-open rules, the chat image text screen, the local scanner
  stack, and the threshold setting. It adds one requirement that names the structural defense as the whole design.
- `source-screening`: a url Source's screen fetches the page and judges only whether it can be read. The concurrency
  requirement drops the scanner timeout.
- `content-moderation`: an invite or public Topic's tags join the classified text, and a new requirement moderates
  avatars and room images with omni-moderation.
- `team-chat`: a shared room image is moderated as an image, and its generated description is no longer screened.
- `topic-attachments`: url and file attachments are no longer screened or redacted, and a failed attachment's reasons
  drop the scanner.
- `table-attachments`: removes the requirement that a table file be screened before its table text is stored.
- `topic-tools`: `addTopicSource` starts the url Source screen, not an llm-guard screen.
- `eval-harness`: removes the scanner measurement, and the published numbers drop the scanner rates.
- `deploy-mechanics`: removes the scanner service requirement.
- `supply-chain`: Dependabot no longer watches a scanner image.

## Impact

-  **Code**: `packages/models` (guard, imageText, moderation), `packages/pipeline` (score, ingesters, screen, attach,
  attachTable, stageTimeouts, linkPreview, temporalClient comments), `apps/worker` (screenSource, processAttachment,
  temporal), `apps/api` (chat attachments, room attachments, avatars, topic save gate, link previews), `packages/db`
  (one `is_unsafe` column on `resources`, generated migration), `packages/contracts` (moderation category mapping),
  `apps/web` and `apps/mobile` (only if the avatar or room image rejection needs new copy).
-  **Prompts**: `summarize-resource.md` gains a version and the safety field. `saveTopicGate.ts` names tags in the text
  kind it passes to `moderate-user-text.md`, which needs no new version.
-  **Infra and CI**: compose, workflows, Dependabot, `carl-up.sh`, `smoke.yml`, `.env.example`, Doppler (add
  `OPENAI_API_KEY`, delete the three `LLM_GUARD_*` keys).
-  **Dependencies**: the text recognition package that `imageText.ts` loads is removed. No dependency is added, since
  the moderation endpoint is one `fetch`.
-  **Behavior a user can see**: fewer explicit Findings, an avatar or room image upload that can be rejected, and an
  attachment holding an injection attempt that is now accepted instead of failed.
