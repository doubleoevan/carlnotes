// a user's paid calls that have no row of their own, such as a page fetch or a search. the call's cost is reserved
// against the user's monthly budget before the call runs, and recorded as the user's spend once it has run

import type { SpendKind } from "@carlnotes/db/schema/spends"
import { recordSpend } from "@carlnotes/db/spends"
import { reportError } from "@carlnotes/server/monitoring"
import { reserveUserSpend } from "./spendReservations"

// the user that the call bills, what it pays for, the Topic it is made for, if it has one, and the most it may cost
export type UserPaidCall = { userId: string; kind: SpendKind; topicId?: string | null; maxDollars: number }

// what a paid call returns: its own result, and what it cost
export type PaidCallResult<CallResult> = { callResult: CallResult; dollars: number }

/**
 * Runs a paid call for a user, or returns "budgetSpent" with no call made if the user's monthly budget is spent, as a
 * chat turn's budget gate does. The cost that the call reports is recorded as the user's spend, so it counts in their
 * month and in the day's total.
 */
export async function runUserPaidCall<CallResult>(
	{ userId, kind, topicId, maxDollars }: UserPaidCall,
	runCall: () => Promise<PaidCallResult<CallResult>>,
): Promise<{ status: "ran"; callResult: CallResult } | { status: "budgetSpent" }> {
	// hold the call's largest cost until its spend is recorded
	const reservation = await reserveUserSpend({ userId, kind: "paidCall", maxDollars })
	if (reservation === "rejected") {
		return { status: "budgetSpent" }
	}

	// run the call, record what it cost, and give the reservation back however the call ends. a failed spend write
	// is reported, and the call's result still reaches the caller
	try {
		const { callResult, dollars } = await runCall()
		await recordSpend({ kind, dollars, userId, topicId }).catch((error: unknown) =>
			reportError(error, "billing", { userId, kind, step: "paid-call-spend" }),
		)
		return { status: "ran", callResult }
	} finally {
		await reservation.release()
	}
}
