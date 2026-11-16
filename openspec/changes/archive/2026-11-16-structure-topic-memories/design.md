## Context

Topic Memories already carry source Finding IDs, first and latest Scan IDs, feedback, and a claim-only vector. The prior pipeline used that vector to choose storage changes.

## Decisions

- Keep the readable sentence separate from the normalized exact key. A person's key includes their name and identifying detail.
- Store each event as a year, month, or day. Exact combines require an equal subject, claim type and normalized value, and compatible dates. A partial or unknown date cannot bridge conflicting dated occurrences. Store the combined statement as outdated and link it to the survivor.
- Supply a bounded list of established Topic subjects to extraction. Reuse the spelling for the same entity and keep identifying details for people. Normalize value formatting while retaining qualifiers, currencies and units.
- Apply exact changes and Scan completion under one Topic lock. Review a unique single-valued predecessor with the same normalized subject, claim type, and event day, and require whole-token value containment. Recheck those conditions and the predecessor's text and version before writing. Both rows and their feedback stay stored.
- Queue interrupted, rejected, and unsupported repairs while preserving the original. Only reviewed nonclaims retire without a saved rewrite. Queued rows stay outside model prompts, exact matching, and eviction.
- Report an owner's LiteLLM HTTP 401 as a nonretryable Journal activity failure. Keep the error free of credentials and leave the completed Scan successful.
- Compute groups from authorized rows with the same normalized subject, claim type, and value in stable ID order. Require every member to have dates and vectors compatible with the other members.
- Show the newest observation and use fuller wording when observation times tie. Keep provenance in storage. Prompts use one ranked claim per group with bounded feedback and source context.
- Keep the phone dataset public-only. Show both texts and event dates while hiding the action class and judge. Measure recall within the sampled candidate pool.
- Hide the Journal button on production Topic pages by default through `TOPIC_JOURNAL_ENABLED`. Enable the rollout after measuring displayed redundancy below 10%.

## Migration Plan

Apply the structured schema and date-precision migration in dev. Extract fields in resumable batches. Verify public Finding links and recheck the row under the Topic lock. Use linked sources for splits and standalone subject names. Leave each unsupported original in history or defer it if current evidence cannot be confirmed.


## Journal reconciliation

After extraction and claim review, compare each atomic claim with the eligible active Journal. Include stable IDs, claim text, people and event dates. Use the nearest eligible rows only when the complete Journal exceeds the input budget. The writer revalidates approved updates under the Topic lock. It retains the target ID and preserves old wording, evidence and feedback in history. A dev backfill also checks already-stored claims because replaying the source Findings alone does not remove preexisting duplicates.


## Canonical Topic subjects

Keep each Topic’s established subject names and verified aliases together. The extractor can cite an explicit alias from an eligible public Finding. Resolve checked claims through the Topic registry before matching. Require equal resolved person match keys for people. Preserve original subject fields in outdated versions when existing rows are backfilled. Recheck claims only for subjects that unified.
