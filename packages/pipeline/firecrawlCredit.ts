// the mark that Firecrawl's credit is spent: a review leaves it in Redis, and the sweep reports it once
import { HOUR_MS, MINUTE_MS } from "@carlnotes/contracts/time"
import { deleteRedisKeys, readRedisJson, saveRedisJson } from "@carlnotes/db/redis"
import { reportThresholdCrossing } from "@carlnotes/server/monitoring"

// the key of the mark, which lasts an hour, so a sweep that ran late still finds it
const FIRECRAWL_CREDIT_SPENT_KEY = "firecrawl-credit-spent"
const CREDIT_SPENT_MARK_TTL_MS = HOUR_MS

// a process writes the mark at most once a minute, so a review of many pages writes it once
const CREDIT_SPENT_MARK_INTERVAL_MS = MINUTE_MS
let lastMarkedAt = 0

/**
 * Marks that a scrape found Firecrawl's credit spent, for the sweep to report. Every page of every review meets the
 * same spent credit, so no page reports it by itself.
 */
export async function markFirecrawlCreditSpent(now = Date.now()): Promise<void> {
	if (now - lastMarkedAt < CREDIT_SPENT_MARK_INTERVAL_MS) {
		return
	}
	lastMarkedAt = now
	await saveRedisJson({ key: FIRECRAWL_CREDIT_SPENT_KEY, value: { markedAt: now }, ttlMs: CREDIT_SPENT_MARK_TTL_MS })
}

/**
 * Reports a spent Firecrawl credit as one threshold crossing if a review marked one since the last sweep, and returns
 * whether it reported.
 */
export async function reportFirecrawlCreditSpent(): Promise<boolean> {
	const creditSpentMark = await readRedisJson<{ markedAt: number }>(FIRECRAWL_CREDIT_SPENT_KEY)
	if (!creditSpentMark) {
		return false
	}

	// take the mark away first, so the next sweep reports only a credit that is still spent
	await deleteRedisKeys(FIRECRAWL_CREDIT_SPENT_KEY)
	reportThresholdCrossing({
		condition: "firecrawl-credit-spent",
		message: "Firecrawl's credit is spent, so the review scores each page on its snippet",
		values: { markedAt: creditSpentMark.markedAt },
	})
	return true
}
