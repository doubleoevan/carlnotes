// a live smoke test for the team chat room's access and write guarantees
// run it with: doppler run -- bun api/chat/room.smoke.ts. needs Doppler secrets
import { connectionPool } from "@carlnotes/db"
import { cleanupFixtures, runId, seedFixtures } from "./roomSmokeFixtures"
import {
	checkAccessMatrix,
	checkAdvisoryLock,
	checkBackwardCursor,
	checkBudgetRejection,
	checkChatRoomIsolation,
	checkChatRoomMentions,
	checkMentionBadges,
	checkRemovalNextRequest,
} from "./roomSmokeSections"

// seed, run every section in order, and always clean up. any failed check throws an error and fails the run
console.log(`\n=== team room smoke (run ${runId}) ===`)
let exitCode = 0
try {
	// the fixtures first, then the seven sections
	await seedFixtures()
	await checkAccessMatrix()
	await checkChatRoomIsolation()
	await checkRemovalNextRequest()
	await checkBudgetRejection()

	// the mention, lock, badge, and cursor sections
	await checkChatRoomMentions()
	await checkAdvisoryLock()
	await checkMentionBadges()
	await checkBackwardCursor()

	// every check passed
	console.log("\n=== smoke PASSED ===")
} catch (error) {
	// a failed check fails the run
	console.error(error)
	exitCode = 1
} finally {
	// cleanup runs even after a failure, and its own failure fails the run
	try {
		await cleanupFixtures()
	} catch (cleanupError) {
		console.error(cleanupError)
		exitCode = 1
	}
}

// close the pool so the process exits on its own, then report the outcome as the exit code
await connectionPool.end()
process.exitCode = exitCode
