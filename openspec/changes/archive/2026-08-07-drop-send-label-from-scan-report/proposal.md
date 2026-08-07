## Why

The scan report closes with a line like `send — there's a clear answer to the original question, with specific players, timelines, and cap figures from the requested sources`. Readers see it in their digest email under "Carl's notes".

The rationale half is worth reading: it tells the reader whether the scan answered what they asked. The `send —` in front of it is not. It is a notification verdict addressed to a machine, and it reads to a reader as a stray instruction.

The label is there because the curation spec asks for it: the report body must end with "an explicit send-or-suppress notification recommendation and the rationale, and no notification is actually dispatched by curation".

Nothing reads the recommendation. `suppress` occurs once in the repo, in the prompt asking for it. Whether a digest goes out is decided by `worker/notify.ts`, which sends when a Topic has email subscribers and never consults the report. So the label steers nothing and costs the reader a moment of confusion on every scan.

## What Changes

- The scan report keeps its closing judgment on whether the Scan answered what the reader asked, and keeps the reasoning behind it.
- That judgment is written as a plain sentence. It no longer leads with a `send` or `suppress` verdict word.
- `worker/prompts/summarize-topic-scan.md` rewords the closing beat and bumps its version.
- No code changes. Nothing reads the label, so nothing loses an input.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `curation`: the report's closing beat becomes a plain-language answer-quality line instead of a send-or-suppress notification decision.

## Impact

- `worker/prompts/summarize-topic-scan.md` — reword one instruction, bump `version` from 6 to 7.
- `openspec/specs/curation/spec.md` — the scan-report requirement and its notification-decision scenario.
- No schema, route, or worker code changes. `scans.scan_summary` keeps its meaning and shape.
- Reports already written keep the old label. This governs reports written from here on, not a backfill.
- The registry currently serves version 9, whose only difference from the bundled template is this closing beat. `bun run prompts:sync` is required before the change takes effect anywhere, because a registry template wins over the bundled one.
