// chat turn authorization tests: a typed chat turn is gated by the whole budget, never by a monthly budget cutoff, a
// free user's by the chat cutoff too, and a free unverified password account's by the unverified accounts switch. a
// failed settings read stops no chat turn
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { FREE_USER_ACCESS_ROW, PLUS_USER_ACCESS_ROW, restoreConnectionPool } from "@carlnotes/db/connectionPoolStub"
import { toSpendControlOverridesRow } from "@carlnotes/db/dailySpendCutoffTestFixtures"
import * as monthlyBudgetCutoffs from "@carlnotes/db/monthlyBudgetCutoffs"
import { restoreRedisClient } from "@carlnotes/db/redisClientStub"
import { quietErrorReports } from "@carlnotes/server/monitoringTestFixtures"
import * as teamMembers from "../team/members"
import { authorizeChatTurn, authorizeNewTopicChatTurn, authorizeTeamChatTurn } from "./chatTurnAuthorization"
import {
	CHAT_CUTOFF_OVERRIDES_ROW,
	stubOwnerTopicRows,
	UNVERIFIED_SWITCH_ON_ROW,
} from "./chatTurnAuthorizationTestFixtures"

// put the spies, the connection pool's own query, and the Redis client back after each test
afterEach(() => {
	mock.restore()
	restoreConnectionPool()
	restoreRedisClient()
})

// the stored settings row with the unverified accounts switch on and a chat cutoff of 50 cents
const UNVERIFIED_SWITCH_ON_CHAT_CUTOFF_ROW = toSpendControlOverridesRow({
	chatCutoffCents: 50,
	isUnverifiedFirstScanLimitOn: true,
})

// the spoken questions cutoff stops spoken questions alone, so a plus owner past it with budget left still types to
// carl
test("a typed chat turn past the spoken questions cutoff is allowed and never reads a cutoff", async () => {
	// 600 of the owner's 1500 cents spent, and every cutoff read as passed
	stubOwnerTopicRows({ scanDollars: "6.00" })
	const isMonthlyBudgetCutoffPassedSpy = spyOn(monthlyBudgetCutoffs, "isMonthlyBudgetCutoffPassed").mockResolvedValue(
		true,
	)

	// the typed chat turn is allowed, and no cutoff was read
	expect(await authorizeChatTurn("owner-1", "topic-1")).toMatchObject({ status: "allowed", userId: "owner-1" })
	expect(isMonthlyBudgetCutoffPassedSpy).not.toHaveBeenCalled()

	// the whole budget spent is what rejects a typed chat turn
	stubOwnerTopicRows({ scanDollars: "15.00" })
	expect(await authorizeChatTurn("owner-1", "topic-1")).toEqual({ status: "budget", userId: "owner-1" })
	expect(isMonthlyBudgetCutoffPassedSpy).not.toHaveBeenCalled()
})

// the chat cutoff pauses a free user's chat turns for the rest of the UTC day, and never a paid user's
test("a free user past the chat cutoff is paused, and a plus user is not", async () => {
	// a dollar of spend today, past a chat cutoff of 50 cents and under the free budget of 2 dollars
	stubOwnerTopicRows({ scanDollars: "1.00", ownerAccessRow: FREE_USER_ACCESS_ROW })
	expect(await authorizeChatTurn("owner-1", "topic-1")).toEqual({ status: "chatPaused", userId: "owner-1" })

	// a plus owner with the same spend chats on
	stubOwnerTopicRows({ scanDollars: "1.00" })
	expect(await authorizeChatTurn("owner-1", "topic-1")).toMatchObject({ status: "allowed", userId: "owner-1" })
})

// while the unverified accounts switch is on, a free account that signed up with a password and has not verified is
// rejected with no cutoff passed, and every other account chats on
test("the unverified accounts switch rejects a free unverified password account's chat turn, and nobody else's", async () => {
	// the switch on and no spend today, for a free unverified password account
	const unverifiedOwnerRows = {
		scanDollars: "0.00",
		ownerAccessRow: FREE_USER_ACCESS_ROW,
		overridesRow: UNVERIFIED_SWITCH_ON_ROW,
		isUnverifiedPasswordUser: true,
	}
	stubOwnerTopicRows(unverifiedOwnerRows)
	expect(await authorizeChatTurn("owner-1", "topic-1")).toEqual({ status: "emailUnverified", userId: "owner-1" })

	// an account that verified its email or signed in with a provider
	stubOwnerTopicRows({ ...unverifiedOwnerRows, isUnverifiedPasswordUser: false })
	expect(await authorizeChatTurn("owner-1", "topic-1")).toMatchObject({ status: "allowed", userId: "owner-1" })

	// a paid unverified password account
	stubOwnerTopicRows({ ...unverifiedOwnerRows, ownerAccessRow: PLUS_USER_ACCESS_ROW })
	expect(await authorizeChatTurn("owner-1", "topic-1")).toMatchObject({ status: "allowed", userId: "owner-1" })

	// the switch off, for a free unverified password account
	stubOwnerTopicRows({ ...unverifiedOwnerRows, overridesRow: CHAT_CUTOFF_OVERRIDES_ROW })
	expect(await authorizeChatTurn("owner-1", "topic-1")).toMatchObject({ status: "allowed", userId: "owner-1" })
})

// a failed settings read reads the switch as off and passes no cutoff, so it never stops a chat turn
test("a failed settings read rejects no chat turn, and is reported", async () => {
	// the settings read fails for a free unverified password account with a dollar spent today
	const reportErrorSpy = quietErrorReports()
	stubOwnerTopicRows({
		scanDollars: "1.00",
		ownerAccessRow: FREE_USER_ACCESS_ROW,
		overridesRow: "unreadable",
		isUnverifiedPasswordUser: true,
	})

	// the chat turn is allowed, and the failed read is reported
	expect(await authorizeChatTurn("owner-1", "topic-1")).toMatchObject({ status: "allowed", userId: "owner-1" })
	expect(reportErrorSpy).toHaveBeenCalled()
})

// a spent budget still reads as a spent budget, and the switch's rejection comes ahead of the chat cutoff's
test("a spent budget is rejected first, then the unverified accounts switch, then the chat cutoff", async () => {
	// the switch on with a chat cutoff of 50 cents, for a free unverified password account whose 2 dollars are spent
	const unverifiedOwnerRows = {
		ownerAccessRow: FREE_USER_ACCESS_ROW,
		overridesRow: UNVERIFIED_SWITCH_ON_CHAT_CUTOFF_ROW,
		isUnverifiedPasswordUser: true,
	}
	stubOwnerTopicRows({ ...unverifiedOwnerRows, scanDollars: "2.00" })
	expect(await authorizeChatTurn("owner-1", "topic-1")).toEqual({ status: "budget", userId: "owner-1" })

	// a dollar spent is past the chat cutoff and under the budget
	stubOwnerTopicRows({ ...unverifiedOwnerRows, scanDollars: "1.00" })
	expect(await authorizeChatTurn("owner-1", "topic-1")).toEqual({ status: "emailUnverified", userId: "owner-1" })

	// once the account verifies, the chat cutoff is what pauses it
	stubOwnerTopicRows({ ...unverifiedOwnerRows, scanDollars: "1.00", isUnverifiedPasswordUser: false })
	expect(await authorizeChatTurn("owner-1", "topic-1")).toEqual({ status: "chatPaused", userId: "owner-1" })
})

// a team's chat and the new-topic chat reject the same account the same way
test("the unverified accounts switch rejects a team chat turn and a new-topic chat turn", async () => {
	// the switch on and no spend today, for a free unverified password account that is a member of team-1
	stubOwnerTopicRows({
		scanDollars: "0.00",
		ownerAccessRow: FREE_USER_ACCESS_ROW,
		overridesRow: UNVERIFIED_SWITCH_ON_ROW,
		isUnverifiedPasswordUser: true,
	})
	spyOn(teamMembers, "toTeamRole").mockResolvedValue("member")
	expect(await authorizeTeamChatTurn("owner-1", "team-1")).toEqual({ status: "emailUnverified", userId: "owner-1" })
	expect(await authorizeNewTopicChatTurn("owner-1")).toEqual({ status: "emailUnverified", userId: "owner-1" })
})
