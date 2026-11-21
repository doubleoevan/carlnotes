// the recap above an updates list: one model call per user per UTC day, and per Topic for a scoped list

import { toUtcDay, withTimeLimit } from "@carlnotes/contracts/time"
import type { UpdatesFinding } from "@carlnotes/contracts/updates"
import { cacheJson, saveRedisJsonIfAbsent } from "@carlnotes/db/redis"
import { loadOrProvisionUserLiteLLMKey } from "@carlnotes/models/litellm"
import { isBudgetRejection } from "@carlnotes/models/models"
import { reserveUserSpend } from "@carlnotes/models/spendReservations"
import { MAX_UPDATES_RECAP_DOLLARS, writeUpdatesRecap } from "@carlnotes/pipeline/updatesRecap"
import { reportError } from "@carlnotes/server/monitoring"

// how long a stored recap lasts. the key names its day, so this only clears the old key
const RECAP_CACHE_TTL_MS = 24 * 60 * 60 * 1000

// how long the marker of a read that ended with no recap lasts under the recap's key
const NO_RECAP_MARKER_TTL_MS = 60_000

// how long a list waits for its recap. the consumptions are saved by then, so a slow model call never holds the list
const RECAP_WAIT_MS = 5_000

// the user the recap is for, the one Topic of a scoped list, and the read of the Findings it is written from, which
// runs only if the day has no stored recap
type LoadUpdatesRecapOptions = {
	userId: string
	topicId: string | null
	loadUpdatesFindings: () => Promise<UpdatesFinding[]>
}

/**
 * Returns the day's recap, or null if the budget is spent, the call fails, the call outlasts the wait, or no recap is
 * stored and there is no Finding to write one from. The Findings are read only if the day has no stored recap. A read
 * that ends with no recap stores null under the recap's key for a minute, so a reload inside that minute reads no
 * Finding, reserves nothing, and calls no model. A recap that a slower call stores replaces that marker, and a call
 * that outlasts the wait still stores its recap for the next list.
 */
export function loadUpdatesRecap({
	userId,
	topicId,
	loadUpdatesFindings,
}: LoadUpdatesRecapOptions): Promise<string | null> {
	const key = toUpdatesRecapKey(userId, topicId)
	const recapWrite = cacheJson<string | null>({
		key,
		ttlMs: RECAP_CACHE_TTL_MS,
		// with no Finding to write from, only the day's stored recap returns, and no model call runs
		load: async () => {
			const updatesFindings = await loadUpdatesFindings()
			const recap = updatesFindings.length > 0 ? await writeRecapWithinBudget(userId, updatesFindings) : null

			// no recap stores its marker for a minute, unless a recap is stored by then
			if (recap === null) {
				await saveRedisJsonIfAbsent({ key, value: null, ttlMs: NO_RECAP_MARKER_TTL_MS })
			}
			return recap
		},
		isStorable: (recap) => recap !== null,
	})
	return withTimeLimit({
		work: recapWrite,
		timeLimitMs: RECAP_WAIT_MS,
		toError: () => new Error("the updates recap outlasted its wait"),
	}).catch(() => null)
}

// the key of a user's recap for today, across their Topics or for one Topic
function toUpdatesRecapKey(userId: string, topicId: string | null): string {
	return `updates-recap:${toUtcDay(new Date())}:${userId}:${topicId ?? "all-topics"}`
}

// reserve the recap's largest cost, then write it on the user's own key. a spent budget or a failed call returns null
async function writeRecapWithinBudget(userId: string, updatesFindings: UpdatesFinding[]): Promise<string | null> {
	// report anything but a spent budget
	try {
		const reservation = await reserveUserSpend({
			userId,
			kind: "updatesRecap",
			maxDollars: MAX_UPDATES_RECAP_DOLLARS,
		})
		if (reservation === "rejected") {
			return null
		}

		// write from the Topic names and the titles, and release the reservation after a success or a failure
		try {
			return await writeUpdatesRecap({
				topicNames: updatesFindings.map((finding) => finding.topicName),
				findingTitles: updatesFindings.flatMap((finding) => finding.title ?? []),
				litellmApiKey: await loadOrProvisionUserLiteLLMKey(userId),
			})
		} finally {
			await reservation.release()
		}
	} catch (error) {
		// a spent budget returns no recap, and any other error is reported too
		if (!isBudgetRejection(error)) {
			reportError(error, "updates", { userId })
		}
		return null
	}
}
