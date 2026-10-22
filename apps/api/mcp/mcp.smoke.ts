// a live smoke test for the mcp server through the sdk client, in-process: a visitor's reads, the oauth flow with
// its forced consent, an account's consumed, rating, and bookmark writes, its edits, and the per-tool-caller rate limit
// run it with: doppler run -- bun api/mcp/mcp.smoke.ts. needs Doppler secrets, and no model at all
import { connectionPool } from "@carlnotes/db"
import { checkOAuth, registeredClientId } from "./mcpOAuthSmokeSections"
import { cleanUp, failureCount, seed } from "./mcpSmokeFixtures"
import { checkRateLimit, checkUser, checkVisitor } from "./mcpSmokeSections"

// seed, run the sections in order, and always clean up
try {
	await seed()
	await checkVisitor()
	const accessToken = await checkOAuth()
	await checkUser(accessToken)
	await checkRateLimit()
} finally {
	// delete the fixtures and close the pool. an open pool keeps the process alive
	await cleanUp(registeredClientId)
	await connectionPool.end()
}

// exit non-zero when any check failed
if (failureCount > 0) {
	console.error(`${failureCount} check(s) failed`)
	process.exit(1)
}
console.log("mcp smoke passed")
