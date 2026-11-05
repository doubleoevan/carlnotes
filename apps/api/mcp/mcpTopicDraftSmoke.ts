// concurrent signed Topic Drafts compete for the same last slot on an isolated development account
import { db } from "@carlnotes/db"
import { teams } from "@carlnotes/db/schema/teams"
import { topics } from "@carlnotes/db/schema/topics"
import { users } from "@carlnotes/db/schema/users"
import { count, eq } from "drizzle-orm"
import { createTeam, removeTopicFromTeam } from "../team/teams"
import { stopFirstScan } from "../topic/firstScanSmoke"
import { check, ownerId, runId, type toClient, toResultText } from "./mcpSmokeFixtures"

/**
 * Checks two different confirmations at the Free limit and the Team selection made by the winning draft.
 */
export async function checkLastDraftSlot(client: ReturnType<typeof toClient>["client"]): Promise<void> {
	const team = await createTeam(ownerId, { name: `${runId} draft team`, topicIds: [] })
	if (team.status !== "created") {
		throw new Error("Could not seed the isolated draft Team")
	}
	try {
		const [owned] = await db.select({ count: count() }).from(topics).where(eq(topics.ownerId, ownerId))
		await db
			.update(users)
			.set({ plan: "free", freeTopicLimit: (owned?.count ?? 0) + 1 })
			.where(eq(users.id, ownerId))
		// confirm two separate previews against a single remaining Topic slot
		const confirmations = await Promise.all(
			["one", "two"].map(async (suffix) => {
				const draft = {
					name: `${runId} slot ${suffix}`,
					prompt: "Coffee",
					frequency: "weekly",
					visibility: "private",
					team: { teamId: team.teamId, name: "Draft team" },
				}
				const preview = await client.callTool({ name: "create_topic", arguments: draft })
				const confirmation = (preview.structuredContent as { confirmation: string }).confirmation
				return { name: "create_topic", arguments: { ...draft, confirmation } }
			}),
		)
		const results = await Promise.all(confirmations.map((call) => client.callTool(call)))
		const winner = results.findIndex((result) => !result.isError)
		const topicId = (results[winner]?.structuredContent as { topicId?: string } | undefined)?.topicId
		check(
			"distinct previews take the final Free slot only once",
			!!topicId &&
				results.filter((result) => result.isError && toResultText(result).includes("topic limit")).length === 1,
		)
		if (!topicId || !confirmations[winner]) {
			throw new Error("Missing winning draft")
		}
		const [attached] = await db.select({ teamId: topics.teamId }).from(topics).where(eq(topics.id, topicId))
		check("the selected Team attaches with the winning creation", attached?.teamId === team.teamId)
		await stopFirstScan(topicId)
		await removeTopicFromTeam(ownerId, team.teamId, topicId)
		const replay = await client.callTool(confirmations[winner])
		const [removed] = await db.select({ teamId: topics.teamId }).from(topics).where(eq(topics.id, topicId))
		check("a replay at the plan limit preserves a later Team removal", !replay.isError && removed?.teamId === null)
	} finally {
		await db.delete(teams).where(eq(teams.id, team.teamId))
	}
}
