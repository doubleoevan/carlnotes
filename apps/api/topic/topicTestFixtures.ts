// the topic test fixtures: the read of one topic with its owner, the row a stubbed connection pool returns for it, and
// the members of the team that owns it
import { FREE_USER_ACCESS_ROW } from "@carlnotes/db/connectionPoolStub"

// how many access columns the topic's owner read selects: role, plan, budget override, free topic limit, admin block
const OWNER_ACCESS_COLUMN_COUNT = 5

// the active members of team-1, which owns topic-1: its owner and member-1
export const TEAM_MEMBER_ROWS = [
	["owner-1", "leader"],
	["member-1", "member"],
]

/**
 * Returns whether a query is the read of one topic with its owner, which loadTopicWithOwner sends.
 */
export function isTopicWithOwnerRead(queryText: string): boolean {
	return queryText.includes(
		'from "topics" inner join "users" on "users"."id" = "topics"."owner_id" where "topics"."id" = $1',
	)
}

/**
 * Returns a topic's row with its owner's identity and access columns, in the order that the topic's read with its
 * owner selects them. The owner is a free user unless an access row is given.
 */
export function toTopicWithOwnerRow(
	topicRow: unknown[],
	ownerUserId: string,
	ownerAccessRow: unknown[] = FREE_USER_ACCESS_ROW,
): unknown[] {
	// the access columns that the access row leaves out are null
	const ownerAccessColumns = Array.from({ length: OWNER_ACCESS_COLUMN_COUNT }, (_, i) => ownerAccessRow[i] ?? null)
	return [...topicRow, ownerUserId, "Owner", null, null, null, ...ownerAccessColumns]
}
