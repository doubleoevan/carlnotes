// replays of workflows that started before a change to their code: each history under replayHistories/ was recorded
// from the workflow code as it was before the change its name gives, and must replay on the code as it is now, so a
// workflow under way at a deploy goes on
import { expect, test } from "bun:test"
import { DefaultLogger, Runtime, Worker } from "@temporalio/worker"

// the histories' folder, and the workflows file that each history's workflow type is exported from
const HISTORIES_PATH = new URL("./replayHistories/", import.meta.url).pathname
const REPLAYED_HISTORIES = [
	{ workflowsFile: "renderTopicVideo.ts", historyFile: "film-rendered-before-launch-hardening.json" },
	{ workflowsFile: "renderTopicVideo.ts", historyFile: "film-failed-before-launch-hardening.json" },
	{ workflowsFile: "renderTopicVideo.ts", historyFile: "film-cancelled-before-launch-hardening.json" },
	{ workflowsFile: "renderTopicVideo.ts", historyFile: "film-rendering-before-launch-hardening.json" },
	{ workflowsFile: "backfillTopicVideos.ts", historyFile: "backfill-first-page-before-launch-hardening.json" },
	{ workflowsFile: "backfillTopicVideos.ts", historyFile: "backfill-last-page-before-launch-hardening.json" },
	{ workflowsFile: "backfillTopicVideos.ts", historyFile: "backfill-rendering-before-launch-hardening.json" },
	{ workflowsFile: "recordPodcastEpisode.ts", historyFile: "recording-published-before-launch-hardening.json" },
	{ workflowsFile: "recordPodcastEpisode.ts", historyFile: "recording-encoding-before-launch-hardening.json" },
	{ workflowsFile: "recordPodcastEpisode.ts", historyFile: "discussion-recorded-before-launch-hardening.json" },
	{ workflowsFile: "runTopicScan.ts", historyFile: "scan-succeeded-before-launch-hardening.json" },
	{ workflowsFile: "runTopicScan.ts", historyFile: "scan-reviewing-before-launch-hardening.json" },
	{ workflowsFile: "topicMemories.ts", historyFile: "topic-memory-backfill-failures-before-launch-hardening.json" },
]

test.each(REPLAYED_HISTORIES)(
	"$historyFile replays on the workflow code as it is now",
	async ({ workflowsFile, historyFile }) => {
		// log only worker errors. the runtime installs once per process, and a second install keeps the first one's logger
		try {
			Runtime.install({ logger: new DefaultLogger("ERROR") })
		} catch {}

		// a replay rejects with a determinism violation if the code sends a command that the history does not hold
		const history = await Bun.file(`${HISTORIES_PATH}${historyFile}`).json()
		const workflowsPath = new URL(`./${workflowsFile}`, import.meta.url).pathname
		const replay = Worker.runReplayHistory({ workflowsPath }, history)
		await expect(replay).resolves.toBeUndefined()
	},
	60_000,
)
