// a live smoke test for the mcp server through the sdk client, in-process: a visitor's reads, the oauth flow with
// its forced consent, an account's consumed, rating, and bookmark writes, its edits, and the per-tool-caller rate limit
// run it with bun run smoke:mcp against the development database, Redis, LiteLLM, and Temporal worker
import { connectionPool } from "@carlnotes/db"
import { cleanUpDirectoryFixtures, seedDirectoryFixtures } from "./mcpDirectorySmokeFixtures"
import { checkOrigins, checkPrivateAccess, checkSubscriptionAccess } from "./mcpDirectorySmokeSections"
import { checkOAuth, checkOAuthRevocation, registeredClientId } from "./mcpOAuthSmokeSections"
import { checkPersonalSourcesRouting } from "./mcpPersonalSourcesSmokeSections"
import { checkResultBounds } from "./mcpResultSmokeSections"
import { cleanUp, failureCount, seed } from "./mcpSmokeFixtures"
import { checkRateLimit, checkUser, checkVisitor } from "./mcpSmokeSections"
import { checkScanTools, checkTopicToolResults, checkVisitorTopicTools } from "./mcpTopicToolSmokeSections"

// seed, run the sections in order, and always clean up
try {
	await seed()
	await seedDirectoryFixtures()
	await checkVisitor()
	await checkVisitorTopicTools()

	// authenticate once and check access, results, and the account's writes
	const accessToken = await checkOAuth()
	await checkOrigins(accessToken)
	await checkPrivateAccess(accessToken)
	await checkSubscriptionAccess(accessToken)
	// check the results, the Scan tools, the Personal sources routes, and the account's writes
	await checkResultBounds(accessToken)
	await checkTopicToolResults(accessToken)
	await checkScanTools(accessToken)
	await checkPersonalSourcesRouting(accessToken)
	await checkUser(accessToken)

	// end the grant and prove the rate limit still applies
	await checkOAuthRevocation(accessToken)
	await checkRateLimit()
} finally {
	// delete the fixtures and close the pool. an open pool keeps the process alive
	try {
		await cleanUp(registeredClientId)
	} finally {
		// remove the separately seeded rows even if owner cleanup failed
		try {
			await cleanUpDirectoryFixtures()
		} finally {
			// release the database pool even if fixture deletion failed
			await connectionPool.end()
		}
	}
}

// exit non-zero when any check failed
if (failureCount > 0) {
	console.error(`${failureCount} check(s) failed`)
	process.exit(1)
}
console.log("mcp smoke passed")
