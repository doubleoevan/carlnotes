// the count of a team's active members
import { and, count, eq } from "drizzle-orm"
import { type DbHandle, db } from "./index"
import { teamMembers } from "./schema/teams"

/**
 * Returns how many active members a team has, read on the handle given.
 */
export async function countActiveTeamMembers(teamId: string, handle: DbHandle = db): Promise<number> {
	const [memberCountRow] = await handle
		.select({ memberCount: count() })
		.from(teamMembers)
		.where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.isActive, true)))
	return memberCountRow?.memberCount ?? 0
}
