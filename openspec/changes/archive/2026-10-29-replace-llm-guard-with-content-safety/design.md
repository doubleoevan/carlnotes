# Design

## Context

LLM Guard reaches the app through one module, `packages/models/guard.ts`, with `screenText` and `screenImage`. It has
seven callers:

- `packages/pipeline/review/score.ts`: screens the scored prefix of every fetched page, and scores the redacted text.
- `apps/worker/workflows/screenSourceActivities.ts`: fetches a url Source's page, screens it, and marks it ready or
  failed.
- `apps/worker/workflows/processAttachmentActivities.ts`: screens an attachment's text as a document or an upload.
- `apps/api/chat/chatAttachmentScreening.ts`: screens private chat text attachments, images (by their text, through
  `imageText.ts` and tesseract.js), and kept attachments' stored words.
- `apps/api/chat/roomAttachments.ts`: screens room attachments and images, and their descriptions.
- `apps/api/chat/attachments.ts`: calls `screenAttachmentText` for kept chat attachments.
- `evals/review-pipeline/reviewPipelineScanner.ts`: the `--guard-only` eval.

Production leaves `LLM_GUARD_URL` unset, so every one of these already returns `skipped` there. Removing the scanner
changes nothing in production except one thing: the url Source screen's retry branch for a scanner that did not answer
disappears.

Text moderation already exists. `packages/models/moderation.ts` (`classifyUserText`) and `apps/api/moderation.ts`
(`toObjectionableCategory`, `toObjectionableTextResponse`) classify text other users read with one cheap-tier call, and
return a 422 in Carl's voice. The user settled four questions before this design:

1. The LLM classification stays for text. OpenAI omni-moderation covers images only.
2. A flagged invite or public Topic keeps the 422 rejection and stays private. Nothing is "held unlisted".
3. No per-Topic opt-in for sensitive subjects.
4. A flagged chat message is rejected with its draft kept, as shipped.

The Smoke workflow on `main` fails at `c9505691`. `apps/api/tool/topicToolsSmokeFixtures.ts` and
`apps/api/mcp/mcpSmokeFixtures.ts` insert users with no `termsAcceptedVersion`. The Terms gate in
`apps/api/termsAcceptance.ts` therefore returns `termsOutdated` for an editor's save and MCP `create_topic`. CI and
CodeQL pass. The user asked for this fix to join this change.

## Goals / Non-Goals

**Goals:**

- No scanner code, container, workflow, setting, or eval mode remains, and the docs describe the structural defense
  as the whole injection design.
- Explicit or toxic content a Scan finds never becomes a new Finding, at no extra model call.
- An avatar or room image that other users see is moderated, for free, failing open.
- The Smoke workflow passes on `main`.

**Non-Goals:**

- Moderating images in a private chat with Carl. Only the sender and Carl see them.
- Hiding a Finding that was kept before its Resource was judged unsafe. The report button and admin delete handle it.
- A per-Topic opt-in, an unlisted hold for flagged Topics, or review queues. Settled above.
- Profile bios. No bio field exists.
- Replacing the text classification with omni-moderation. Settled above.

## Decisions

### 1. The structural defense is the whole injection design

These already exist and stay as they are: `writePrompt`'s per-call nonce fence and its tag stripping
(`packages/models/prompts/write.ts`), the task restated after every untrusted block, Zod `Output.object` schemas on
every consumed model call, pipeline calls given no tools, the private chat applying only a preview the user's next
message agrees to (`topic-tools`), the recap's allowlisted links, and the content security policy. The new
`injection-defense` requirement names them together, so the spec reads as current state, not "scanner plus
fallback".

### 2. The url Source screen stays, as a fetch check

The screen still does real work after the scanner leaves. It tells an owner, once, that a url can't be read, and it
keeps an unread url hidden from non-owners until it can be read. `screenSource` drops the `screenText` call, the
`SOURCE_SCREEN_TIMEOUT_MS` constant, and the "scanner did not answer" retry. The fetch retry and its day of grace
stay.

The names `screenSource`, `screenSourceWorkflow`, the `source-screening` task queue, `SCREEN_CONCURRENCY`, and the
`sources.status` column all stay. Renaming the queue would strand in-flight workflows on deploy. "Screen" still
describes a gate a Source passes before it is read. Comments that say "llm-guard screen" change to "url Source screen".

Alternative considered: delete the workflow and fetch on the first Scan. Rejected, because the owner would lose the
early "this page can't be read" signal, and the non-owner visibility gate would have nothing to wait on.

### 3. Attachments are stored as extracted

`processAttachmentActivities.ts` drops its screen step and stores the extracted text, or the summaries, directly. In
`attachTable.ts`, `SCREEN_CHAR_HEADROOM` existed because redaction could change the text's length after the row
budget, so it goes. The budget becomes `MAX_TABLE_CHARS` alone. `chatAttachmentScreening.ts` keeps its resolution of
attachments into model parts but loses every screen, and renames to `chatAttachmentParts.ts`, since nothing in it
screens anymore. `screenAttachmentText` and `reportFlaggedAttachment` are deleted, and their callers use the clipped
text directly.

`SCANNER_FLAGGED_REASON_PREFIX` and its branch in `toAttachmentFailureMessage` stay, so an attachment that failed
before this change still reads as flagged to its owner. Its comment says the prefix only appears on rows from before
the removal.

### 4. Source flags are read where each ingester maps its posts

- **Reddit** (`reddit.ts`, `parsePosts`): `RedditListing`'s child data gains `over_18?: boolean`. A child with
  `over_18 === true` is skipped. The OAuth and JSON listings include the field. The RSS fallback (`toRssUrl`) does not,
  and the scorer's judgment covers it.
- **X** (`x.ts`, `toResources`): TwitterAPI.io's tweet object is not the official v2 shape. A live advanced-search
  response checked during apply includes no sensitivity field on the tweet, but its `author` has `possiblySensitive`.
  A tweet whose account is marked possibly sensitive is skipped, the way Bluesky's account labels are.
- **Bluesky** (`bluesky.ts`, `parseLinks`): `BlueskyPost` gains `labels?: { val: string }[]`, and so does its
  `author`. A post is skipped if either label list holds `porn`, `sexual`, `nudity`, or `graphic-media`. Those four
  values live in one `ADULT_LABELS` set.

A skipped post is not a Resource, so it costs no fetch or score and needs no new drop reason.

### 5. The scorer's safety field

`scoreSchema` becomes `{ score, relevanceExplanation?, isUnsafe? }`, with `isUnsafe` an optional boolean whose absence
reads as `false`. `summarize-resource.md` moves to version 7 and gains one paragraph outside the premium-tier block, so
both tiers return it. The paragraph asks for `isUnsafe: true` only for content that is sexually explicit or that
itself attacks, threatens, or degrades people, and never for reporting, analysis, or discussion of hard subjects. That
is the same line `moderate-user-text.md` draws.

`scoreResource` returns `isUnsafe`. If the cheap tier says unsafe, the premium tier is skipped, which saves money. If
either tier says unsafe, `fetchAndScoreResource` writes `resources.is_unsafe = true`, upserts no Finding, and returns
`{ status: "filtered", reason: "unsafe content" }`. This replaces the scanner's "flagged by scanner" reason in
`track.ts` and the scan report. A Resource scored safe sets `is_unsafe = false`, so changed content can clear the mark.

`resources.is_unsafe` is a new `boolean not null default false` column in `packages/db/schema/scans.ts`, added with
`bun run db:generate`. It goes on the Resource, not the Finding. Unsafe describes the content, which every Topic shares,
and the link-preview check (decision 6) looks Resources up by url.

An existing Finding stays. `findings` cascades to notes, bookmarks, and ratings (`scans.ts`), so deleting the Finding
would delete a user's own writing. The upsert is skipped, so its score and explanation freeze at the last safe review.

Alternative considered: filter `is_unsafe` out of every feed read path. Rejected for this change. There are many read
paths (feed, search, MCP, email, podcast), and the case is rare: content that was once relevant and safe, then turned
unsafe.

### 6. Link previews skip the image of an unsafe url

In `apps/api/chat/linkPreviews.ts`, `loadUnsafeLinkPreviewUrls` reads, in one query per batch, which preview urls have
an unsafe Resource stored under their canonical form, `toCanonicalUrl` from ingest. A new preview skips the image fetch,
a stored preview's card drops its image path, and the image route serves nothing for that url, so an image stored before
the Resource was judged unsafe stops showing too. A match stores the metadata with no image. The card's title and
description render as usual. No other preview path exists.

### 7. Image moderation through omni-moderation

`packages/models/moderation.ts` gains `classifyImage({ dataUrl })`. It makes one `fetch` POST to
`https://api.openai.com/v1/moderations` with model `omni-moderation-latest`, and passes the image's data url as it
arrived in an `image_url` input. It is bounded by the existing `MODERATION_TIMEOUT_MS` and keyed by `OPENAI_API_KEY`.
It returns the same `ModerationClassification` union as `classifyUserText`, with `skipped` if the key is unset. A
response is parsed with a Zod schema, and anything outside it is `failed`. A 4xx other than a timeout or a rate limit
returns `unreadable`, which rejects the upload, so an image format the endpoint does not take cannot pass for an
outage. A room post checks its images at once, after the room's membership check. The error is built the way
`toReportableError` builds one, so no image bytes reach monitoring.

It calls OpenAI directly, not through LiteLLM. The LiteLLM proxy has no OpenAI provider, the endpoint is free,
and adding a provider plus a model alias to the proxy for one free call adds config for nothing. The key is read from
`Bun.env` like the other provider keys.

**Categories and thresholds.** Use OpenAI's own per-category booleans (`results[0].categories`), not custom score
thresholds. No data exists here to set better ones. They map onto the existing `ModerationCategory`:

| omni-moderation category | ModerationCategory |
|---|---|
| `sexual/minors` | `childSafety` |
| `sexual` | `sexual` |
| `violence/graphic` | `violence` |
| `self-harm`, `self-harm/intent`, `self-harm/instructions` | `selfHarm` |
| `hate`, `hate/threatening` | `hate` |
| `harassment`, `harassment/threatening` | `harassment` |

Plain `violence` and both `illicit` categories don't count for images. A news photo or a sports injury would trip
plain `violence`, and the text classification also leaves illicit content out. On images, OpenAI scores only a subset
of categories (the sexual, violence, and self-harm families). The others stay false and the table still holds. The
first category that matches, in the table's order, names the rejection.

`apps/api/moderation.ts` gains `toObjectionableImageCategory({ dataUrl, subjectKind, subjectId })`. It mirrors
`toObjectionableCategory`'s fail-open and reporting through one shared `toViolationCategory` helper instead of a second
copy. Callers:

-  **Avatar upload** (`apps/api/avatars.ts`, `toAvatarRejection`): after the size and type checks and before
  `uploadAttachment`. A category returns `toObjectionableContentResponse`, and an unreadable image is the existing
  `unsupported-type` rejection. Carl's rejection copy now fits an image, so `OBJECTIONABLE_TEXT_REJECTION` and its
  siblings are renamed to their `OBJECTIONABLE_CONTENT_*` forms.
-  **Room image** (`roomRoute.ts`): checked after the room's membership check and the message's text check, before the
  post runs, so one 422 path covers both. `roomAttachments.ts` drops `screenImage`, and the image description is stored
  as generated (team-chat delta).
-  **Team avatar**: the team avatar upload shares the user upload's check, since other members see it too.

The web and mobile avatar uploaders need to show the 422. Apply checks how each shows an upload error today, and
reuses the room composer's rejection display (`ObjectionableContentResponse`) instead of adding a new one.

### 8. Topic tags join the topic text

`saveTopicGate.ts` already classifies an invite or public Topic's name and prompt as `"a topic's name and prompt"`.
The tags join that same text, as `Tags: a, b, c`, in the same single call. The text kind becomes
`"a topic's name, prompt, and tags"`, so the prompt names what it reads. `moderate-user-text.md` needs no version
change, since the kind is a trusted variable.

### 9. The Smoke fix

Both fixtures gain `termsAcceptedVersion: TERMS_VERSION, termsAcceptedAt: new Date()` on every user they insert.
Apply also greps every `*SmokeFixtures.ts` and `*.smoke.ts` that inserts users, and adds the same fields wherever that
user writes user content. Those smokes pass today only because their users don't reach a gated write. `smoke.yml`
also drops its `env LLM_GUARD_URL=` override along with the scanner.

### 10. The docs

The repository has no `ARCHITECTURE.md`. The README's "Content screening (LLM Guard)" section and its two diagrams are
the injection design doc. They are rewritten as "Content safety and injection defense", with the four content-safety
layers (Source flags with Exa's filter, the scorer's field, text moderation, and image moderation) and the structural
injection defense, as current state. The other docs to update are `evals/README.md`, the root `AGENTS.md` (the module
map's "the guard" and "image text", and the eval routing row's workflow), and the `AGENTS.md` files of
`packages/models`, `packages/pipeline`, and `apps/worker`. `.agents/commands/audit-structure.md`, the privacy page's
provider table (a new OpenAI row for avatar and room-image moderation), and `.env.example` change too.

## Risks / Trade-offs

- **The scorer misjudges a sensitive subject as unsafe** → Content safety then filters a relevant sex-education or
  harm-reduction page. Mitigation: the prompt draws the reporting-versus-doing-harm line, and the drop is counted in
  the scan report under its own reason, so a pattern is visible. With no opt-in, a wrongly blocked topic shows up as a
  report.
- **A false negative passes** → The report button and admin delete remain the backstop, as today.
- **Reddit's RSS fallback and tweets from unmarked accounts have no flag** → Only the scorer covers them.
- **A Finding kept before content turned unsafe stays visible** → The report button covers it, as noted in decision 5.
- **Images go to a new provider** → OpenAI's moderation endpoint is free and does not train on API data. The privacy
  page gains its row in this change.
- **Attachments lose personal-data redaction** → Production has run this way since September. The privacy page already
  says context documents reach model providers.
- **Removing the scanner also removes the injection check on owner-supplied pages and attachments** → The fence holds
  them as data, a Scan model has no tools, and a chat change still needs the user's agreement.

## Migration Plan

1. Merge the Smoke fixture fix with the rest of the change, so the first push runs green.
2. `bun run db:generate` creates the `is_unsafe` migration, which runs on deploy. The default is `false`, so no
   backfill is needed.
3. Doppler: add `OPENAI_API_KEY` to `prd` and `dev`, and delete `LLM_GUARD_URL`, `LLM_GUARD_TIMEOUT_MS`, and
   `LLM_GUARD_INJECTION_THRESHOLD`. With the key unset, image moderation skips, so deploy order doesn't matter.
4. After deploy, run `bun run prompts:sync:prd` so the registry serves `summarize-resource` version 7.
5. Rollback: revert the commit. The `is_unsafe` column is harmless if left in place.

## Resolved Questions

- TwitterAPI.io has no tweet-level sensitivity field, so the author's `possiblySensitive` mark is read (decision 4).
- `PrivacyPage.tsx` moves its "Last updated" date. It has no separate version constant.
