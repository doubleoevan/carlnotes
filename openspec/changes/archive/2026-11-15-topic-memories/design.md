# Design

## Context

The Scan workflow already starts independent children after its closing write. Review hashes its existing Topic Context. The Topic page receives a takeaway count. Journal pages and ratings use a dedicated API route with private caching rules.

## Goals / Non-Goals

- Keep public evidence and private sender context separate.
- Preserve the existing review cache and mobile response contracts.
- Let a Scan finish independently of the takeaway update.

## Decisions

- Key takeaway updates on Scan ID and store completion in the same transaction as the takeaways. A Topic row lock serializes takeaway updates and feedback.
- Use a scan-keyed job lease to avoid paying twice for concurrent attempts. Recheck evidence, feedback, and the best current match under the Topic lock before applying writes.
- Cluster up to 30 retained external public Findings at 0.92 cosine similarity using Resource vectors. Each call sees one cluster and its five nearest active or outdated takeaways. Exclude CarlNotes-generated content across Topics.
- The model proposes atomic facts and corrections with the event day and Finding indexes separate from the text. Code combines compatible claims at 0.98 or above, flags them from 0.80 up to 0.98, and adds them below 0.80. Evicted entries can reactivate and absorbed entries resolve to their surviving replacement.
- Clean up every fifth successful Scan. Ask the model to confirm flagged pairs using both claims, dates, and source Findings. Preserve the earliest first Scan and all Finding IDs. Keep original feedback on historical rows and copy the newest vote per user onto the survivor.
- Guard identity with a match key from the normalized name and identifying detail. Reject proposed combinations with conflicting event days or identities. Match rejected statements by text with case and whitespace normalized.
- Evict the lowest importance times recency score above 100 active rows. Each completed Scan since the last sighting multiplies recency by 0.9. Saved takeaways and corrections are exempt. Feedback writes cap saved takeaways at 30 and let a voter clear their thumb up.
- A feedback upsert belongs to its rater. Either thumb saves a note in the same write and reloads it for the rater. A blank downvote rejects the row. A downvote with a note remains a correction. Bounded notes from both ratings reach Carl as fenced background.
- Compute ranking in the database. Use cosine similarity within feedback tiers for chapter and post retrieval. Protected takeaways stay active if they exceed the 100-row eviction target.
- Use the existing dialog and native Sheet, pagination, feedback buttons, and form fields. Share query state, paging, copy, and row composition through core. Put the Journal beside the accordion trigger so its button remains separately focusable.

## Risks / Trade-offs

A source change or retry can race with another Scan. The write rechecks source eligibility and current status before applying changes. The historical backfill captures a cutoff and processes a small page of Topics per Temporal run. Sync the shared parent prompts only after every worker runs the new builders, since the older builders do not know the Journal placeholder.

## Rollout

1. Apply the database migration in dev, then deploy the API, worker, and web builds. Verify the Expo update against that API.
2. After the previous workers drain, sync the prompt registry. Run the historical backfill with
   `doppler run --project carlnotes --config dev -- bun run topic-memories:backfill`.
3. Use the snapshot and replay commands in `evals/README.md` to measure precision, recall, and duplicate rates before and after the writes.
4. After verifying dev, repeat the migration and deployment on production. Sync the production prompts after the
   worker rollout and use `--config prd` for the backfill.
