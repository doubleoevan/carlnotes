// topic page helper tests: the scan fields read the manual scans cutoff and the whole budget for someone who may scan
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import * as monthlyBudgetCutoffs from "../../db/monthlyBudgetCutoffs"
import * as quotas from "../../db/quotas"
import type { topics } from "../../db/schema/topics"
import * as authorization from "../authorization"
import * as invites from "../invite/invites"
import { toInviteAndScanFields } from "./helpers"
import * as topicQuotas from "./quotas"

// put the spies back after each test
afterEach(() => {
	mock.restore()
})

// a topic owned by owner-1, with only its id and owner set
const TOPIC = { id: "topic-1", ownerId: "owner-1" } as typeof topics.$inferSelect

// the paused flag is the manual scans cutoff check, and the spent flag is the monthly budget check, each read on
// its own
test("the scan fields read the manual scans cutoff and the whole budget for someone who may scan", async () => {
	// an owner who may scan, with no invites and two of five scans left today
	const isAllowedSpy = spyOn(authorization, "isAllowed").mockResolvedValue(true)
	spyOn(invites, "loadPendingTopicInvites").mockResolvedValue([])
	spyOn(topicQuotas, "scansRemaining").mockResolvedValue(2)
	spyOn(quotas, "dailyScanLimit").mockResolvedValue(5)

	// a spend past the manual scans cutoff and under the whole budget
	const isMonthlyBudgetCutoffPassedSpy = spyOn(monthlyBudgetCutoffs, "isMonthlyBudgetCutoffPassed").mockResolvedValue(
		true,
	)
	const isMonthlySpendExhaustedSpy = spyOn(authorization, "isMonthlySpendExhausted").mockResolvedValue(false)

	// the owner's scan is paused and the budget is not spent, each read for the owner
	expect(await toInviteAndScanFields("owner-1", TOPIC, true)).toEqual({
		inviteRows: [],
		manualScansRemaining: 2,
		manualScanLimit: 5,
		isManualScanPaused: true,
		isSpendExhausted: false,
	})
	expect(isMonthlyBudgetCutoffPassedSpy).toHaveBeenCalledWith("owner-1", "manualScans")
	expect(isMonthlySpendExhaustedSpy).toHaveBeenCalledWith("owner-1")

	// a spent budget sets the spent flag beside the paused one
	isMonthlySpendExhaustedSpy.mockResolvedValue(true)
	expect(await toInviteAndScanFields("owner-1", TOPIC, true)).toMatchObject({
		isManualScanPaused: true,
		isSpendExhausted: true,
	})

	// someone who may not scan has neither flag, and neither spend check runs
	isAllowedSpy.mockResolvedValue(false)
	isMonthlyBudgetCutoffPassedSpy.mockClear()
	isMonthlySpendExhaustedSpy.mockClear()
	expect(await toInviteAndScanFields("user-1", TOPIC, false)).toMatchObject({
		isManualScanPaused: false,
		isSpendExhausted: false,
	})
	expect(isMonthlyBudgetCutoffPassedSpy).not.toHaveBeenCalled()
	expect(isMonthlySpendExhaustedSpy).not.toHaveBeenCalled()
})
