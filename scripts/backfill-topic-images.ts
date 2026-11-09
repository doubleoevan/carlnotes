// starts the topic image backfill on the worker's Temporal and waits for it. run under doppler, with the mode after
// the script: bun run topic-images:backfill -- --mode missing, or redo after a house style change, or resize
import { parseArgs } from "node:util"
import { startTopicImageBackfillWorkflow } from "@carlnotes/pipeline/temporalClient"

// the mode from the arguments, missing by default
const { values } = parseArgs({ options: { mode: { type: "string", default: "missing" } } })
const mode = values.mode
if (mode !== "missing" && mode !== "redo" && mode !== "resize") {
	console.error(`--mode must be missing, redo, or resize, not ${mode}`)
	process.exit(1)
}

// start the backfill, or join the one running, and wait for its summary
const { topicCount, failedCount } = await startTopicImageBackfillWorkflow({ mode })
console.log(`topic image backfill (${mode}): ${topicCount} topics, ${failedCount} failed`)
process.exit(failedCount > 0 ? 1 : 0)
