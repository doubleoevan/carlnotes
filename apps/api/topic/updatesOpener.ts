// the opener above an updates list: one model call per user per UTC day, and per Topic for a scoped list

import { toUtcDay, withTimeLimit } from "@carlnotes/contracts/time"
import type { UpdatesFinding } from "@carlnotes/contracts/updates"
import { db } from "@carlnotes/db"
import { toConvertedPersonalSourcesFilter } from "@carlnotes/db/personalSourcesAuthority"
import { cacheJson, readRedisJson } from "@carlnotes/db/redis"
import { topics } from "@carlnotes/db/schema/topics"
import { loadOrProvisionUserLiteLLMKey } from "@carlnotes/models/litellm"
import { isBudgetRejection } from "@carlnotes/models/models"
import { reserveUserSpend } from "@carlnotes/models/spendReservations"
import { MAX_UPDATES_OPENER_DOLLARS, writeUpdatesOpener } from "@carlnotes/pipeline/updatesOpener"
import { reportError } from "@carlnotes/server/monitoring"
import { and, eq, not } from "drizzle-orm"

// how long a stored opener lasts. the key names its day, so this only clears the old key
const OPENER_CACHE_TTL_MS = 24 * 60 * 60 * 1000

// how long a list waits for its opener. the consumptions are saved by then, so a slow model call never holds the list
const OPENER_WAIT_MS = 5_000

// the user the opener is for, the one Topic of a scoped list, and the read of the Findings it is written from, which
// runs only if the day has no stored opener
type LoadUpdatesOpenerOptions = {
	userId: string
	topicId: string | null
	loadUpdatesFindings: () => Promise<UpdatesFinding[]>
}

/**
 * Returns the day's opener, or null if the budget is spent, the call fails, the call outlasts the wait, or no opener is
 * stored and there is no Finding to write one from. The Findings are read only if the day has no stored opener. Null
 * is never stored, so the next list tries again, and a call that outlasts the wait still stores its opener for that
 * list.
 */
export function loadUpdatesOpener({
	userId,
	topicId,
	loadUpdatesFindings,
}: LoadUpdatesOpenerOptions): Promise<string | null> {
	const openerWrite = cacheJson<string | null>({
		key: toUpdatesOpenerKey(userId, topicId),
		ttlMs: OPENER_CACHE_TTL_MS,
		// with no Finding to write from, only the day's stored opener returns, and no model call runs
		load: async () => {
			const updatesFindings = await loadUpdatesFindings()
			return updatesFindings.length > 0 ? writeOpenerWithinBudget(userId, updatesFindings) : null
		},
		isStorable: (opener) => opener !== null,
	})
	return withTimeLimit({
		work: openerWrite,
		timeLimitMs: OPENER_WAIT_MS,
		toError: () => new Error("the updates opener outlasted its wait"),
	}).catch(() => null)
}

/**
 * Returns the user's stored opener for today across their Topics, or null. Nothing is written, so
 * no model call runs and no budget is reserved. A user who owns a private Topic whose Personal sources text is not
 * converted gets null, because the opener may be written from that Topic's Findings.
 */
export async function readStoredUpdatesOpener(userId: string): Promise<string | null> {
	const [unconvertedTopic] = await db
		.select({ id: topics.id })
		.from(topics)
		.where(and(eq(topics.ownerId, userId), eq(topics.visibility, "private"), not(toConvertedPersonalSourcesFilter())))
		.limit(1)
	return unconvertedTopic ? null : readRedisJson<string>(toUpdatesOpenerKey(userId, null))
}

// the key of a user's opener for today, across their Topics or for one Topic
function toUpdatesOpenerKey(userId: string, topicId: string | null): string {
	return `updates-opener:${toUtcDay(new Date())}:${userId}:${topicId ?? "all-topics"}`
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
