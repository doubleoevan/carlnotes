import { db } from "@carlnotes/db"
import { topics } from "@carlnotes/db/schema/topics"
import { users } from "@carlnotes/db/schema/users"
import { eq } from "drizzle-orm"
import { checkPageBounds, type SmokeClient } from "./mcpResultSmokeSections"
import { check, insertSmokeUser, ownerId, runId, topicId, toResultJson, withClient } from "./mcpSmokeFixtures"
import { BOUND_SERVER_TEXT } from "./results"
import { toResultText } from "./toolTestFixtures"

// a stranger with one public and one private topic
const strangerId = `${runId}-stranger`
const strangerPublicTopicId = `${runId}-stranger-public-topic`
const strangerPrivateTopicId = `${runId}-stranger-private-topic`

// what read_profile returns, in the fields the smoke reads
type ReadProfile = { userId: string; includesNonPublicTopics: boolean; topicTable: { items: { id: string }[] } }

/** Checks the profile, activity, and account tools on both routes, with the stranger removed after. */
export async function checkAccountTools(accessToken: string): Promise<void> {
	await seedStranger()
	try {
		// the profiles, the activity, and the account on /mcp, then the bound route
		await withClient("/mcp", accessToken, async (client) => {
			await checkProfiles(client)
			await checkActivityAndAccount(client)
		})
		await withClient(`/mcp/t/${topicId}`, accessToken, checkBoundRoute)
	} finally {
		// the stranger's topics, then the stranger
		await db.delete(topics).where(eq(topics.ownerId, strangerId))
		await db.delete(users).where(eq(users.id, strangerId))
	}
}

// the stranger's account and topics
async function seedStranger(): Promise<void> {
	await insertSmokeUser(strangerId)
	await db.insert(topics).values([
		{ id: strangerPublicTopicId, ownerId: strangerId, name: `${runId} public`, prompt: "smoke", visibility: "public" },
		{
			id: strangerPrivateTopicId,
			ownerId: strangerId,
			name: `${runId} private`,
			prompt: "smoke",
			visibility: "private",
		},
	])
}

// the owner's own profile by default, and the stranger's with only its public topic
async function checkProfiles(client: SmokeClient): Promise<void> {
	// the owner's own profile when no id is named
	const ownResult = await client.callTool({ name: "read_profile", arguments: {} })
	const ownProfile = toResultJson<ReadProfile>(ownResult)
	check("/mcp: read_profile reads the caller's own profile", ownProfile.userId === ownerId, ownProfile.userId)
	checkPageBounds("/mcp read_profile", ownResult)

	// the stranger's profile holds the public topic and not the private one
	const strangerProfile = toResultJson<ReadProfile>(
		await client.callTool({ name: "read_profile", arguments: { user_id: strangerId } }),
	)
	const topicIds = strangerProfile.topicTable.items.map((topicRow) => topicRow.id)
	check(
		"/mcp: read_profile shows another person's public topics alone",
		!strangerProfile.includesNonPublicTopics &&
			topicIds.includes(strangerPublicTopicId) &&
			!topicIds.includes(strangerPrivateTopicId),
		strangerProfile,
	)
}

// the owner's activity lists their topic, and the account links to the plans page
async function checkActivityAndAccount(client: SmokeClient): Promise<void> {
	// the activity with the owner's topic
	const activityResult = await client.callTool({ name: "read_activity", arguments: {} })
	const ownedTopicIds = toResultJson<{ ownedTopics: { items: { id: string }[] } }>(
		activityResult,
	).ownedTopics.items.map((ownedTopic) => ownedTopic.id)
	check("/mcp: read_activity lists the owner's topic", ownedTopicIds.includes(topicId), ownedTopicIds)
	checkPageBounds("/mcp read_activity", activityResult)

	// the account with its plan and the plans page
	const accountResult = await client.callTool({ name: "read_account", arguments: {} })
	const account = toResultJson<{ plan: string; plansUrl: string }>(accountResult)
	check("/mcp: read_account reads the plan and its link", Boolean(account.plan) && account.plansUrl.endsWith("/plans"))
	checkPageBounds("/mcp read_account", accountResult)
}

// the bound route reads no profile, and still reads the caller's own activity and account
async function checkBoundRoute(client: SmokeClient): Promise<void> {
	// a profile is never the bound topic
	const profileText = toResultText(await client.callTool({ name: "read_profile", arguments: { user_id: strangerId } }))
	check("bound route: read_profile reads no profile", profileText === BOUND_SERVER_TEXT, profileText)

	// the caller's own activity and account
	for (const toolName of ["read_activity", "read_account"]) {
		const toolResult = await client.callTool({ name: toolName, arguments: {} })
		check(`bound route: ${toolName} reads the caller's own`, !toolResult.isError, toResultText(toolResult))
	}
}
