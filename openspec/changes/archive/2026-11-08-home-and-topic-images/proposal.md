# Proposal

## Why

Every Topic is a block of text today, so the directory, the share cards, the podcast covers, and the MCP views all
look alike, and the home page is the directory itself, with nothing to show a visitor what CarlNotes is. An AI-made
image on every Topic gives each Topic a face that its cards, covers, and share images reuse, and a home page built
from those cards gives a visitor a reason to sign in and a user a place to start.

## What Changes

- **Topic images.** Every Topic gets one image, rendered on create by a cheap image model from a scene a cheap text
  model writes from the Topic's own name, prompt, tags, and recent Finding titles, under a fixed house style. The owner
  can regenerate it, steered by their own image prompt in any style once it passes moderation, under a per-plan monthly
  limit, or upload their own, which is center-cropped to 3:2 in code. One stored original and six derived files (three
  sizes at 1x and 2x) live in object storage under a content hash and are served at immutable urls, auth-gated for a
  non-public Topic. Until the image is drawn the drawn cover shows, so no page waits on a render.
- **Model path.** The request's FLUX.1 schnell on Fireworks is not deployed on this account (see design), so both
  renders run on Gemini image models through the LiteLLM Gemini pass-through on the owner's virtual key, the way
  speech already does, with the app's own cost row metering the monthly budget.
- **Covers and share images.** The podcast episode and show covers composite their title layers over the Topic's
  image instead of the drawn illustration, and the Topic and Podcast Episode share cards draw the image across the
  top like the home page's cards. The drawn
  versions stay as the fallback for a Topic with no image yet.
- **Flags.** A Topic's image is reportable. The admin console's Reports view offers Regenerate on an image report,
  which renders a fresh image and drops an upload.
- **Backfill.** One idempotent Temporal workflow renders an image for every Topic that has none, public first, a
  few at a time, on the platform key, with a redo mode after a style change and a resize-only mode.
- **Topics page.** The current home content moves to `/topics` as the directory, each row carrying the list image.
  Topics joins the user menu. **BREAKING** for the `seo` spec's `/topics` redirect, which reverses.
- **Home page.** `/` gets two faces. A visitor sees a server-rendered, edge-cached page: Carl's hero, featured Topic and
  Podcast Episode cards with inline play, how it works in three steps, with `WebSite` and `ItemList` structured data. A
  user sees their Updates, the featured cards, and their own Topics as cards restored from the parked patch. Featured
  topics and podcast episodes are the pinned feature order first, then trending, from a cached query, purged at the edge
  when a pin changes.
- **Shared cards.** One `TopicCard`, one `PodcastEpisodeCard`, and one `TopicImage` component in `packages/core`
  with Nightshift contracts, rendered on web, mobile, and in the MCP views through platform adapters.
- **Mobile.** The image on the topic screen, the Topics tab (the directory), search images, the editor's
  Regenerate and Upload your own from the photo library, and the signed-in Home tab with featured cards and your
  Topics. A visitor sees the web's visitor face at phone width.
- **MCP.** `list_topics` and `search` results carry image urls by size. The findings view header and the search
  view's Topic rows show the image. No new tools.
- **Analytics.** PostHog events for image generated, regenerated, uploaded, and removed, home viewed by face, and a
  featured card opened. IDs only.
- **Docs.** The domain model gains Topic Image and Topic Image Render, the privacy policy covers generated images,
  uploads, and who sees a private Topic's image, and the plans page and plan cards show the regeneration limit.

## Capabilities

### New Capabilities

- `topic-images`: the image every Topic carries: how it is written and rendered, its sizes and urls, who may see
  it, regeneration under a plan limit, uploads, removal, reporting, and the backfill.
- `home-page`: the home route's visitor face and user face, the featured topics and podcast episodes, their cache, and
  the page's structured data.
- `topic-cards`: the shared Topic card, Podcast Episode card, and Topic image components and where each renders.

### Modified Capabilities

- `feed-homepage`: the directory lives at `/topics` and its rows carry the list image.
- `seo`: `/topics` is a page again, the home page leads crawlers to it, and the home's structured data adds an
  `ItemList` of the featured topics.
- `topic-featuring`: a Podcast Episode can hold a feature order, the admin console gains a Featured card, and a pin
  change purges the home page at the edge.
- `mcp-server`: `list_topics` and `search` results include each Topic's image urls by size.
- `mcp-views`: the findings view header and the search view's Topic rows show the image.
- `social-sharing`: the Topic card draws the Topic's image and its key covers the image hash.
- `podcast-feeds`: covers composite over the Topic's image and their keys cover the image hash.
- `content-reporting`: a Topic's image is a report subject, and the Reports view offers Regenerate on it.
- `subscription-billing`: plan cards state the monthly regeneration limit.
- `site-search`: Topic rows carry the image.
- `mobile-feed`: the Home tab is the signed-in face and a Topics tab is the directory.
- `updates`: the Updates card leads the signed-in home, with no updates page.
- `topic-editing`: the editor shows the image with Regenerate and Upload your own.
- `edge-caching`: topic image responses and the home page's cache tag.
- `monitoring-analytics`: the topic image and home events.
- `domain-schema`: the `topic_images` and `topic_image_renders` tables and the Podcast Episode feature order.

## Impact

- `packages/contracts`: `topicImageSizes`, `topicImageOrigins`, the topic image urls contract, `imageRegenerationLimit`
  on every plan, `topicImage` as a report subject kind, the analytics event names, the home payload.
- `packages/db`: two new tables, `feature_order` on `podcast_episodes`, the monthly spend sum, the regeneration count,
  the `topicImage:regenerate` gate capability.
- `packages/models`: the scene prompt and the house style prompt, the image call through the Gemini pass-through,
  the per-image cost rates.
- `packages/pipeline`: `topicImages/` (scene writing, rendering, sizes with sharp, storage keys), the Temporal client
  starts. `sharp` is a new dependency there.
- `apps/worker`: the topic image workflow and the backfill workflow.
- `apps/api`: the image routes (serve, upload, regenerate, remove), the home payload, the featured query, the cover
  and share card composites, the report subject, the admin Featured card routes, the edge purge.
- `apps/web`: `HomePage` (two faces), `TopicsPage` (today's home), the cards and image component adapters, the editor
  controls, the user menu entry, the admin Featured card, the Updates UI restored from `logs/updates-web-mobile.patch`.
- `apps/mobile`: the Topics tab, the Home tab face, the editor controls with `expo-image-picker`, the card adapters.
- `apps/docs` and the privacy page, the domain-model skill, `apps/mobile/parity.md`, the AGENTS.md files whose
  layout changes.
- The Notion Persona & Voice page and the CarlNotes social page's Names table are the user's to update by hand.
