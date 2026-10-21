// chat turn authorization tests: a typed chat turn is gated by the whole budget alone, never by a monthly budget cutoff
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import {
	PLUS_USER_ACCESS_ROW,
	restoreConnectionPool,
	stubConnectionPool,
	toSpendSumRows,
	toTableRow,
} from "@carlnotes/db/connectionPoolStub"
import * as monthlyBudgetCutoffs from "@carlnotes/db/monthlyBudgetCutoffs"
import { topics } from "@carlnotes/db/schema/topics"
import { authorizeChatTurn } from "./chatTurnAuthorization"

// put the spies and the connection pool's own query back after each test
afterEach(() => {
	mock.restore()
	restoreConnectionPool()
})

// stub the connection pool to return a public topic owned by owner-1, a plus owner, and the given scan spend
function stubPlusOwnerTopicRows(scanDollars: string): void {
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

		// the owner's access row for the access read, and no rows for any other query
		return text.includes('from "users"') ? [PLUS_USER_ACCESS_ROW] : []
	})
}

// the spoken questions cutoff stops spoken questions alone, so a plus owner past it with budget left still types to
// carl
test("a typed chat turn past the spoken questions cutoff is allowed and never reads a cutoff", async () => {
	// 600 of the owner's 1500 cents spent, and every cutoff read as passed
	stubPlusOwnerTopicRows("6.00")
	const isMonthlyBudgetCutoffPassedSpy = spyOn(monthlyBudgetCutoffs, "isMonthlyBudgetCutoffPassed").mockResolvedValue(
		true,
	)

	// the typed chat turn is allowed, and no cutoff was read
	expect(await authorizeChatTurn("owner-1", "topic-1")).toMatchObject({ status: "allowed", userId: "owner-1" })
	expect(isMonthlyBudgetCutoffPassedSpy).not.toHaveBeenCalled()

	// the whole budget spent is what rejects a typed chat turn
	stubPlusOwnerTopicRows("15.00")
	expect(await authorizeChatTurn("owner-1", "topic-1")).toEqual({ status: "budget", userId: "owner-1" })
	expect(isMonthlyBudgetCutoffPassedSpy).not.toHaveBeenCalled()
})
