// the url Source check activities: fetch the page and mark the Source ready or failed
import { DAY_MS } from "@carlnotes/contracts/time"
import { db } from "@carlnotes/db"
import { sources } from "@carlnotes/db/schema/topics"
import { type FetchResult, fetchContent } from "@carlnotes/pipeline/scrape"
import { RETRYABLE_SCREEN_FAILURE_TYPE } from "@carlnotes/pipeline/stageTimeouts"
import { isRetryableFetchFailure, toFetchableUrl } from "@carlnotes/server/publicFetch"
import { ApplicationFailure } from "@temporalio/activity"
import { eq } from "drizzle-orm"

// how long after a Source is saved a retryable fetch failure leaves it pending instead of failed
export const RETRYABLE_FETCH_GRACE_MS = DAY_MS

// the error codes Bun and Node give a fetch whose connection dropped or was turned away
const DROPPED_CONNECTION_CODES = new Set([
	"ECONNRESET",
	"ECONNREFUSED",
	"ECONNABORTED",
	"ETIMEDOUT",
	"EPIPE",
	"ConnectionRefused",
	"ConnectionClosed",
	"FailedToOpenSocket",
])

/**
 * Fetches the page for a url Source, then marks it ready or failed with the reason. The screen judges only whether the
 * page can be read.
 * A url that cannot be fetched is a rejection, not a warning: its page produces nothing on every future Scan,
 * and the owner should be told so. A fetch that failed for a reason the next attempt may pass, such as a rate limit or
 * a timeout, is thrown as a retryable failure that the workflow retries.
 */
export async function screenSource(sourceId: string): Promise<void> {
	// a Source that is no longer saved is marked non-retryable
	// instead of having the workflow ask for it again on a schedule
	const [source] = await db.select().from(sources).where(eq(sources.id, sourceId))
	if (!source) {
		throw ApplicationFailure.nonRetryable(`source ${sourceId} not found`, "SourceNotFound")
	}

	// the page url lives in the Source config. a non-string url is a misconfigured Source that should not get retried
	const pageUrl = source.config.url
	if (typeof pageUrl !== "string") {
		await failSource(sourceId, "this source has no url to read")
		return
	}

	// reject a malformed, non-http, or internal url before any request goes out, then fetch the page
	const fetched = await fetchPage(pageUrl)
	if (fetched instanceof Error) {
		// retry a fetch failure that the next attempt may pass within a day of the save, and record any other for the owner
		if (shouldRetrySourceFetch({ error: fetched, savedAt: source.createdAt, now: new Date() })) {
			throw toRetryableScreenFailure(fetched.message)
		}
		await failSource(sourceId, `this page could not be read: ${fetched.message}`)
		return
	}

	// a page that can be read readies the Source
	await db.update(sources).set({ status: "ready", error: null }).where(eq(sources.id, sourceId))
}

/**
 * Mark a Source failed with the reason to show its owner.
 */
export async function failSource(sourceId: string, reason: string): Promise<void> {
	await db.update(sources).set({ status: "failed", error: reason }).where(eq(sources.id, sourceId))
}

// the fetch failure, when the Source was saved, and the time of the check
export type ShouldRetrySourceFetchOptions = { error: Error; savedAt: Date; now: Date }

/**
 * Whether a fetch failure leaves the Source pending for another try: a rate limit, a server error, a timeout, or a
 * dropped connection, within a day of the save.
 */
export function shouldRetrySourceFetch({ error, savedAt, now }: ShouldRetrySourceFetchOptions): boolean {
	const isRetryableFailure = isRetryableFetchFailure(error) || isDroppedConnection(error)
	return isRetryableFailure && now.getTime() - savedAt.getTime() < RETRYABLE_FETCH_GRACE_MS
}

// whether a fetch error is a connection that dropped or was turned away, read from its message or its code
function isDroppedConnection(error: Error): boolean {
	// Bun and Node set the code on the error itself or on the error it wraps
	const errorCode = (error as { code?: unknown }).code ?? (error.cause as { code?: unknown } | undefined)?.code
	return error.message === "fetch failed" || (typeof errorCode === "string" && DROPPED_CONNECTION_CODES.has(errorCode))
}

// the failure that the workflow's retry policy runs again
function toRetryableScreenFailure(message: string): ApplicationFailure {
	return ApplicationFailure.create({ message, type: RETRYABLE_SCREEN_FAILURE_TYPE, nonRetryable: false })
}

// the page's Markdown, or the error that stopped it. every rejection names its own reason to show to the topic's owner
async function fetchPage(pageUrl: string): Promise<FetchResult | Error> {
	// a Source url names a page to read, so it takes the scrape instead of the caption path a video would
	try {
		return await fetchContent(toFetchableUrl(pageUrl).toString(), "read")
	} catch (error) {
		return error instanceof Error ? error : new Error(String(error))
	}
}
