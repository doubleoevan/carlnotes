// source llm-guard screening activities
import { DAY_MS } from "@shared/time"
import { ApplicationFailure, Context } from "@temporalio/activity"
import { eq } from "drizzle-orm"
import { db } from "../../db"
import { sources } from "../../db/schema/topics"
import { screenText, toFlaggedReason } from "../guard"
import { toFetchableUrl } from "../publicFetch"
import { type FetchResult, fetchContent } from "../scrape"
import { SCREEN_ATTEMPTS, TRANSIENT_SCREEN_FAILURE } from "./stageTimeouts"

// how long an llm-guard screen of a Source's page may take, longer than an inline screen a user waits on
const SOURCE_SCREEN_TIMEOUT_MS = 20_000

// how long after a Source is saved a transient fetch failure leaves it pending instead of failed
export const TRANSIENT_FETCH_GRACE_MS = DAY_MS

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
 * Fetch the page for a url Source and screen it with llm-guard, then mark it ready or failed with the reason.
 * A url that cannot be fetched is a rejection, not a warning: its page produces nothing on every future Scan,
 * and the owner should be told so. A fetch or a screen that failed for a reason the next attempt may pass, such as a
 * rate limit, a timeout, or a scanner that did not answer, is thrown as a transient failure that the workflow retries.
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
		// retry a transient fetch failure within a day of the save, and record any other failure for the owner
		if (isRetryableFetchFailure(fetched, source.createdAt, new Date())) {
			throw toTransientScreenFailure(fetched.message)
		}
		await failSource(sourceId, `this page could not be read: ${fetched.message}`)
		return
	}

	// llm-guard screens the fetched Markdown the same way a Resource's content is screened before it is scored.
	// a screen that could not run is retried, and passes on the last attempt
	const screenVerdict = await screenText(fetched.text, "page", { timeoutMs: SOURCE_SCREEN_TIMEOUT_MS })
	if (screenVerdict.outcome === "failed" && Context.current().info.attempt < SCREEN_ATTEMPTS) {
		throw toTransientScreenFailure("llm-guard did not answer the screen")
	}

	// record the verdict: a flagged page fails the Source with the reason, and a clean page readies it
	if (screenVerdict.isFlagged) {
		await failSource(sourceId, toFlaggedReason(screenVerdict))
		return
	}
	await db.update(sources).set({ status: "ready", error: null }).where(eq(sources.id, sourceId))
}

/**
 * Mark a Source failed with the reason to show its owner.
 */
export async function failSource(sourceId: string, reason: string): Promise<void> {
	await db.update(sources).set({ status: "failed", error: reason }).where(eq(sources.id, sourceId))
}

/**
 * Whether a fetch error is one the next attempt may pass: a rate limit, a server error, a timeout, or a dropped connection.
 */
export function isTransientFetchError(error: Error): boolean {
	// read the status at the end of the message and the error's code, never the url the message names
	const isTimeout = error.name === "TimeoutError" || error.name === "AbortError"
	const isRateLimitOrServerError = / returned (429|5\d\d)$/.test(error.message)
	const errorCode = (error as { code?: unknown }).code ?? (error.cause as { code?: unknown } | undefined)?.code
	const isDroppedConnection =
		error.message === "fetch failed" || (typeof errorCode === "string" && DROPPED_CONNECTION_CODES.has(errorCode))
	return isTimeout || isRateLimitOrServerError || isDroppedConnection
}

/**
 * Whether a fetch failure leaves the Source pending for another try: a transient failure within a day of the save.
 */
export function isRetryableFetchFailure(error: Error, savedAt: Date, now: Date): boolean {
	return isTransientFetchError(error) && now.getTime() - savedAt.getTime() < TRANSIENT_FETCH_GRACE_MS
}

// the failure that the workflow's retry policy runs again
function toTransientScreenFailure(message: string): ApplicationFailure {
	return ApplicationFailure.create({ message, type: TRANSIENT_SCREEN_FAILURE, nonRetryable: false })
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
