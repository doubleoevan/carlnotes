# Tasks

## 1. Contracts, schema, and plans

- [x] 1.1 Add `topicImageSizes`, `TopicImageSize`, `topicImageOrigins`, and `topicImageRenderKinds` to
      `packages/contracts/enums.ts`, `topicImage` to `reportSubjectKinds`, and `packages/contracts/topicImages.ts`
      with `TopicImageUrls`, `toTopicImagePath`, and `toTopicImageUrls`; verify with unit tests of the url builder and
      `bunx tsc -b`
- [x] 1.2 Add `imageRegenerationLimit` (free 2, plus 15, premium 30) to every plan in `packages/contracts/plans.ts`
      and the `topicImage:regenerate` capability to the gate with the admin bypass and the monthly count; verify with
      the gate's tests covering a free user at 1, at 2, and an admin
- [x] 1.3 Add `topic_images` and `topic_image_renders` to `packages/db/schema/topics.ts` and `feature_order` to the
      podcast episodes schema, run `bun run db:generate`, and add `image` to the Topic payloads the feed, topic page,
      search rows, `list_topics`, and the MCP search rows return; verify with `bun test packages/db` and the contract
      freeze check
- [x] 1.4 Add the render cost to the monthly spend sum in `packages/db/quotas.ts` and the per-model per-image rates to
      `packages/models/budget.ts`; verify with the spend sum test adding a render row

## 2. The scene writer, the render, and the files

- [x] 2.1 Write `packages/models/prompts/topic-image-scene.md` and `topic-image-style.md` with frontmatter, register
      them in the fallback templates, and build `packages/pipeline/topicImages/writeTopicImageScene.ts` on
      `cheap-model` with every input fenced; verify with a test that a fenced instruction stays data and that the
      style follows the scene
- [x] 2.2 Add `packages/models/topicImageModel.ts`: one `generateContent` call through the LiteLLM Gemini pass-through
      with `responseModalities: ["IMAGE"]` and `aspectRatio: "3:2"`, reusing the speech failure shape; verify with a
      test of the budget-spent and rejected outcomes and one smoke render under `doppler run`
- [x] 2.3 Add `sharp` to `packages/pipeline` and `topicImages/topicImageFiles.ts`: center-crop to 3:2, resize to the
      original size, strip metadata, encode the original jpeg and the six webp files, hash the original, store under
      `topic-images/<topicId>/<hash>/`; verify with a test on a tall png fixture checking the ratio, the absence of
      EXIF, and the seven keys
- [x] 2.4 Add the `topicImage` Temporal workflow and its two activities in `apps/worker/workflows/` with the recording's
      retry policy, the render row's status writes, pending deletion of the replaced objects, and the feed cache clear;
      verify with the workflow bundle check and a test of a failed render leaving the row failed
- [x] 2.5 Start a create render from `startFirstScan`'s after-transaction path on the owner's key; verify by creating a
      Topic on dev and seeing the image on the topic page within a minute

## 3. Routes

- [x] 3.1 Add `GET /api/topic-images/:topicId/:hash/:file` with the public immutable headers and tag, the `topic:view`
      gate and private headers for a non-public Topic, and 404 on a stale hash; verify with route tests for a visitor
      on a public and a private Topic
- [x] 3.2 Add `POST /api/topics/:id/image/regenerate`, `POST /api/topics/:id/image`, and `DELETE /api/topics/:id/image`
      with the `topic:edit` gate, the regeneration count, the magic-bytes and size checks, and the analytics events;
      verify with route tests for the limit, a 12 MB file, a gif, and a removal starting a render
- [x] 3.3 Purge the image tag when a Topic leaves the public set, beside the feature order release; verify with the
      edge cache test

## 4. Covers and share cards

- [x] 4.1 Draw the podcast cover over the Topic's image with the gradient bands and include the image hash in
      `toPodcastCoverKey`; verify with a rendered cover under 512 KB from a sample and a key test
- [x] 4.2 Draw the Topic share card with the image across its top and hash the image hash into its key; verify with a
      rendered card and the key test

## 5. Shared cards and the image component

- [x] 5.1 Add `packages/nightshift/components/topic-image.ts` and `card.ts` and run `bun run nightshift:write`; verify
      with the component parity check
- [x] 5.2 Add `packages/core/components/TopicImage.tsx`, `TopicCard.tsx`, and `PodcastEpisodeCard.tsx` with their
      `…Elements` adapters, the web adapters in `apps/web/src/components/topic/` and `podcast/` with stories, and the
      mobile adapters with stories; verify with Storybook previews of each and the parity checks

## 6. The Topics page and the home page

- [x] 6.1 Move today's `HomePage` body to `apps/web/src/pages/TopicsPage.tsx` on a `/topics` route, drop the `/topics`
      redirect, add the `page` image to the Topic row, and add Topics to `UserMenuItems`; verify with the route tests
      and a server render of `/topics` for a visitor
- [x] 6.2 Add `GET /api/home` with the featured topics and podcast episodes from one Redis entry, the
      pinned-then-trending formula, and the first page of a user's Topics as card rows, with
      `GET /api/home/your-topics` for each later page of five; verify with tests of the formula on pinned,
      private, and tied Topics
- [x] 6.3 Build the visitor face of `HomePage`: hero lines, featured cards, inline play, how it works, sign in, the
      `ItemList` JSON-LD, and the `home` cache tag; verify with a server render holding the structured data and a
      visitor's headers
- [x] 6.4 Build the user face: featured cards, your Topics as cards, the empty state, and the Updates button and page
      restored from `logs/updates-web-mobile.patch`; verify with the restored tests and stories and a signed-in load
- [x] 6.5 Send `home_view` and `featured_card_open` from the browser; verify with the visit analytics test

## 7. Featuring and moderation

- [x] 7.1 Add the Podcast Episode Rank dialog on the podcast episode page and `PATCH
      /podcast-episodes/:id/feature-order` with the Topic rules, the admin console's Featured card with both lists, and
      the home card ids cache clear and `home` purge on every change; verify with the featuring tests extended to
      podcast episodes and the purge
- [x] 7.2 Add Report image to the topic page's report menu, the image in the Reports view's cell, and Regenerate as a
      resolution that writes an `admin` render on the master key; verify with the report route tests and a console
      resolve

## 8. Editor, mobile, and MCP

- [x] 8.1 Add the image, Regenerate with its image prompt and `X of Y`, Upload your own, and Remove to the web editor's
      podcast block's neighbor, polling the topic payload until the hash changes; verify with stories and a dev
      regeneration on a free test account spending both
- [x] 8.2 Add the mobile Topics tab, the Home tab face with the cards, the topic screen's `page` image, the search
      image, and the editor's Regenerate and Upload your own with `expo-image-picker`; verify on the iOS simulator
      against the web at 375 pixels and record the rows in `apps/mobile/parity.md`
- [x] 8.3 Add image urls to `list_topics` and the MCP search rows, the `list` image to the findings view header, and the
      `thumbnail` image to the search view; verify with the MCP smoke suite and `bun run smoke:mcp-views`
- [x] 8.4 Write the scene from the Topic and the owner's image prompt, drawn without the house style, after the text
      moderation;
      screen every upload's cropped original through the image moderation; and pulse the empty image frame while a
      render runs; verify with the route tests for a flagged prompt and the editor story

## 9. Backfill and docs

- [x] 9.1 Add the `backfillTopicImages` workflow with the missing, redo, and resize modes, three children at a time,
      and the root script `topic-images:backfill`; verify by running it on dev twice, once in redo mode, and reading
      the render rows
- [x] 9.2 Update the domain-model skill with Topic Image and Topic Image Render, the privacy page with generated
      images, SynthID, uploads, and private image access, the plans docs and `PlanCard` with the regeneration line,
      the AGENTS.md files whose layout changed, and the README's script list; verify with `bun run docs:embed` and a
      read of each page
- [x] 9.3 Run the verification gate: `bun run check`; verify green

## 10. Podcast episode images

- [x] 10.1 Add `podcast_episodes.image_hash`, the podcast episode image pipeline, the publish step in
      `recordPodcastEpisode`, the image route, the summary's `image`, and `podcast-episode-images:backfill`; verify by
      running the backfill on dev and reading the page
- [x] 10.2 Show the podcast episode's own image on the web and mobile podcast episode pages, the shared podcast episode
      card, and both search rows, with `Podcast · age · listeners · Topic` and `· Topic` on finding rows; verify at 390
      pixels in the browser
- [x] 10.3 Draw the podcast episode cover as the card, image over an espresso panel with the title and detail line,
      template `v7`; verify with the cover tests and a rendered dev cover
- [x] 10.4 Give the editor the "Image prompt" placeholder, Upload with the count at the row's end, and a press on the
      image to upload with the camera overlay; verify with the editor stories
- [x] 10.5 Put the headline beside New Topic on both faces, how it works for a visitor, and the Topics link where the
      docs link was; verify at 360 and 390 pixels signed out and signed in
- [x] 10.6 Move the updates list to the signed-in home as the Updates card, starting at 30 minutes, with the
      Update button highlighting the shown length, and remove the updates page and screen; verify signed in at 390
      pixels
- [x] 10.7 Show Featured topics, Featured podcasts, and Your topics in the shared collapsible section, open at first,
      with the count at the right, and link "All of it." and the MCP view's "and N more" to the Topics page; verify at
      390 pixels
- [x] 10.8 Feature up to five Podcast Episodes, add New podcasts this week, count both in podcast episodes, start every
      table except the admin tables at five rows, and confirm a Rank dialog Save that drops a pin
- [x] 10.9 Draw the home's sections and the Topics page's with one `AccordionSection` per platform, five cards a page
      with every card in the html without JavaScript, a divider only under a closed section, and "Your followed topics"

## Workflow follow-up

- The user updates the Persona & Voice page with the hero lines and the CarlNotes social page's Names table with the
  decided words.
- Archive the change through `/ship` after the manual checks in the Notion row.
