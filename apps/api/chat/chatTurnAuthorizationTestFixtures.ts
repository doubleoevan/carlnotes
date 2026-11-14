// the chat turn authorization tests' shared setup: the stored settings rows, and the stubbed database that returns
// owner-1's topic, access row, and spend, and whether owner-1 is an unverified password account. only tests import it
import { PLUS_USER_ACCESS_ROW, stubConnectionPool, toSpendSumRows, toTableRow } from "@carlnotes/db/connectionPoolStub"
import { toSpendControlOverridesRow } from "@carlnotes/db/dailySpendCutoffTestFixtures"
import { stubRedisClient } from "@carlnotes/db/redisClientStub"
import { topics } from "@carlnotes/db/schema/topics"

// the stored settings row with a chat cutoff of 50 cents and every other setting at its default
export const CHAT_CUTOFF_OVERRIDES_ROW = toSpendControlOverridesRow({ chatCutoffCents: 50 })

// the stored settings row with the unverified accounts switch on and every cutoff at its default
export const UNVERIFIED_SWITCH_ON_ROW = toSpendControlOverridesRow({ isUnverifiedFirstScanLimitOn: true })

// the rows the stubbed database returns for owner-1's chat turn
type OwnerTopicRows = {
	// the owner's scan spend in dollars, and the owner's access row, a plus owner's by default
	scanDollars: string
	ownerAccessRow?: unknown[]
	// the stored settings row, with a chat cutoff of 50 cents by default, or unreadable for a settings read that fails
	overridesRow?: unknown[] | "unreadable"
	// whether the owner signed up with a password and has not verified their email
	isUnverifiedPasswordUser?: boolean
}

/**
 * Stubs an empty Redis and the connection pool to return a public topic owned by owner-1, the owner's access row, the
 * stored settings, the given scan spend, and whether the owner is an unverified password account.
 */
export function stubOwnerTopicRows({
	scanDollars,
	ownerAccessRow = PLUS_USER_ACCESS_ROW,
	overridesRow = CHAT_CUTOFF_OVERRIDES_ROW,
	isUnverifiedPasswordUser = false,
}: OwnerTopicRows): void {
	// the topic row, with only its id, owner, and visibility set
	stubRedisClient()
	const topicRow = toTableRow(topics, { id: "topic-1", ownerId: "owner-1", visibility: "public" })

	// return the scan spend for the scan sum and nothing for the other sums, then the topic row for the topic read
	stubConnectionPool(({ text }) => {
		if (text.includes("sum(")) {
			return toSpendSumRows(text, { 'from "scans"': scanDollars })
		}
		if (text.includes('from "topics"')) {
			return [topicRow]
		}

		// the stored settings for the cutoff read, and the unverified check, which reads users as the access read does
		if (text.includes('from "spend_control_settings"')) {
			return toOverridesRows(overridesRow)
		}
		if (text.includes('"email_verified"')) {
			return isUnverifiedPasswordUser ? [["owner-1"]] : []
		}

		// the owner's access row for the access read, and no rows for any other query
		return text.includes('from "users"') ? [ownerAccessRow] : []
	})
}

// the rows of the stored settings read, which fails for an unreadable row
function toOverridesRows(overridesRow: unknown[] | "unreadable"): unknown[][] {
	if (overridesRow === "unreadable") {
		throw new Error("database unreachable")
	}
	return [overridesRow]
}
