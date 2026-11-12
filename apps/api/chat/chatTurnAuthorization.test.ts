// chat turn authorization tests: a typed chat turn is gated by the whole budget, never by a monthly budget cutoff, and a
// free user's by the chat cutoff too
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import {
	FREE_USER_ACCESS_ROW,
	PLUS_USER_ACCESS_ROW,
	restoreConnectionPool,
	stubConnectionPool,
	toSpendSumRows,
	toTableRow,
} from "@carlnotes/db/connectionPoolStub"
import * as monthlyBudgetCutoffs from "@carlnotes/db/monthlyBudgetCutoffs"
import { restoreRedisClient, stubRedisClient } from "@carlnotes/db/redisClientStub"
import { topics } from "@carlnotes/db/schema/topics"
import { authorizeChatTurn } from "./chatTurnAuthorization"

// put the spies and the connection pool's own query back after each test
afterEach(() => {
	mock.restore()
	restoreConnectionPool()
	restoreRedisClient()
})

// the stored settings row with a chat cutoff of 50 cents and every other setting at its default
const CHAT_CUTOFF_OVERRIDES_ROW = [null, null, 50, null, null, false]

// stub the connection pool to return a public topic owned by owner-1, the owner's access row (a plus owner's by
// default), and the given scan spend
function stubOwnerTopicRows(scanDollars: string, ownerAccessRow: unknown[] = PLUS_USER_ACCESS_ROW): void {
	// the topic row, with only its id, owner, and visibility set
	const topicRow = toTableRow(topics, { id: "topic-1", ownerId: "owner-1", visibility: "public" })

	// return the scan spend for the scan sum and nothing for the other sums, then the topic row for the topic read
	stubConnectionPool(({ text }) => {
		if (text.includes("sum(")) {
			return toSpendSumRows(text, { 'from "scans"': scanDollars })
		}
		if (text.includes('from "topics"')) {
			return [topicRow]
		}

		// the stored settings for the cutoff read
		if (text.includes('from "spend_control_settings"')) {
			return [CHAT_CUTOFF_OVERRIDES_ROW]
		}

		// the owner's access row for the access read, and no rows for any other query
		return text.includes('from "users"') ? [ownerAccessRow] : []
	})
}

// the spoken questions cutoff stops spoken questions alone, so a plus owner past it with budget left still types to
// carl
test("a typed chat turn past the spoken questions cutoff is allowed and never reads a cutoff", async () => {
	// 600 of the owner's 1500 cents spent, and every cutoff read as passed
	stubOwnerTopicRows("6.00")
	const isMonthlyBudgetCutoffPassedSpy = spyOn(monthlyBudgetCutoffs, "isMonthlyBudgetCutoffPassed").mockResolvedValue(
		true,
	)

	// the typed chat turn is allowed, and no cutoff was read
	expect(await authorizeChatTurn("owner-1", "topic-1")).toMatchObject({ status: "allowed", userId: "owner-1" })
	expect(isMonthlyBudgetCutoffPassedSpy).not.toHaveBeenCalled()

	// the whole budget spent is what rejects a typed chat turn
	stubOwnerTopicRows("15.00")
	expect(await authorizeChatTurn("owner-1", "topic-1")).toEqual({ status: "budget", userId: "owner-1" })
	expect(isMonthlyBudgetCutoffPassedSpy).not.toHaveBeenCalled()
})

// the chat cutoff pauses a free user's chat turns for the rest of the UTC day, and never a paid user's
test("a free user past the chat cutoff is paused, and a plus user is not", async () => {
	// a dollar of spend today, past a chat cutoff of 50 cents and under the free budget of 2 dollars
	stubRedisClient()
	stubOwnerTopicRows("1.00", FREE_USER_ACCESS_ROW)
	expect(await authorizeChatTurn("owner-1", "topic-1")).toEqual({ status: "chatPaused", userId: "owner-1" })

	// a plus owner with the same spend chats on
	stubRedisClient()
	stubOwnerTopicRows("1.00")
	expect(await authorizeChatTurn("owner-1", "topic-1")).toMatchObject({ status: "allowed", userId: "owner-1" })
})
