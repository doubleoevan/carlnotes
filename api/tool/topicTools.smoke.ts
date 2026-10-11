// a live smoke test for the topic tools: the gate inside them, the prompt versions they write, adding and removing
// a source, creating a topic from a draft, and that no tool starts a scan
// run it with: doppler run -- bun api/tool/topicTools.smoke.ts. needs Doppler secrets and no model
import { connectionPool } from "../../db"
import { checkTopicDrafts } from "./topicDraftSmokeSections"
import { checkTopicSources } from "./topicSourceSmokeSections"
import { cleanUp, failureCount, seed } from "./topicToolsSmokeFixtures"
import { checkTopicUpdates } from "./topicUpdateSmokeSections"

try {
	// seed the fixtures, then run the update, source, and draft sections in order
	const otherTopicSourceId = await seed()
	await checkTopicUpdates()
	await checkTopicSources(otherTopicSourceId)
	await checkTopicDrafts()
} finally {
	// delete the fixtures whatever happened, then close the pool. an open pool keeps the process alive
	await cleanUp()
	await connectionPool.end()
}

// one failure fails the run
if (failureCount > 0) {
	console.error(`${failureCount} check(s) failed`)
	process.exit(1)
}
console.log("topic tools smoke passed")
