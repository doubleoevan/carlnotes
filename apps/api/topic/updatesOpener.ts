// the opener above an updates list: one model call per user per UTC day, and per Topic for a scoped list

import { withTimeLimit } from "@carlnotes/contracts/time"
import type { UpdatesFinding } from "@carlnotes/contracts/updates"
import { toUtcDay } from "@carlnotes/db/quotas"
import { cacheJson } from "@carlnotes/db/redis"
import { loadOrProvisionUserLiteLLMKey } from "@carlnotes/models/litellm"
import { isBudgetRejection } from "@carlnotes/models/models"
import { reserveUserSpend } from "@carlnotes/models/spendReservations"
import { MAX_UPDATES_OPENER_DOLLARS, writeUpdatesOpener } from "@carlnotes/pipeline/updatesOpener"
import { reportError } from "@carlnotes/server/monitoring"

// how long a stored opener lasts. the key names its day, so this only clears the old key
const OPENER_CACHE_TTL_MS = 24 * 60 * 60 * 1000

// how long a list waits for its opener. the consumptions are saved by then, so a slow model call never holds the list
const OPENER_WAIT_MS = 5_000

// the user the opener is for, the one Topic of a scoped list, and the Findings it is written from
type LoadUpdatesOpenerOptions = {
	userId: string
	topicId: string | null
	updatesFindings: UpdatesFinding[]
}

/**
 * Returns the day's opener, or null if the budget is spent, the call fails, or the call outlasts the wait. Null is
 * never stored, so the next list tries again, and a call that outlasts the wait still stores its opener for that list.
 */
export function loadUpdatesOpener({
	userId,
	topicId,
	updatesFindings,
}: LoadUpdatesOpenerOptions): Promise<string | null> {
	const openerWrite = cacheJson<string | null>({
		key: `updates-opener:${toUtcDay(new Date())}:${userId}:${topicId ?? "all-topics"}`,
		ttlMs: OPENER_CACHE_TTL_MS,
		load: () => writeOpenerWithinBudget(userId, updatesFindings),
		isStorable: (opener) => opener !== null,
	})
	return withTimeLimit({
		work: openerWrite,
		timeLimitMs: OPENER_WAIT_MS,
		toError: () => new Error("the updates opener outlasted its wait"),
	}).catch(() => null)
}

// reserve the opener's largest cost, then write it on the user's own key. a spent budget or a failed call returns null
async function writeOpenerWithinBudget(userId: string, updatesFindings: UpdatesFinding[]): Promise<string | null> {
	// report anything but a spent budget
	try {
		const reservation = await reserveUserSpend({
			userId,
			kind: "updatesOpener",
			maxDollars: MAX_UPDATES_OPENER_DOLLARS,
		})
		if (reservation === "rejected") {
			return null
		}

		// write from the Topic names and the titles, and release the reservation after a success or a failure
		try {
			return await writeUpdatesOpener({
				topicNames: updatesFindings.map((finding) => finding.topicName),
				findingTitles: updatesFindings.flatMap((finding) => finding.title ?? []),
				litellmApiKey: await loadOrProvisionUserLiteLLMKey(userId),
			})
		} finally {
			await reservation.release()
		}
	} catch (error) {
		// a spent budget returns no opener, and any other error is reported too
		if (!isBudgetRejection(error)) {
			reportError(error, "updates", { userId })
		}
		return null
	}
}
