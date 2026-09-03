// source llm-guard screening activities
import { ApplicationFailure } from "@temporalio/activity"
import { eq } from "drizzle-orm"
import { db } from "../../db"
import { sources } from "../../db/schema"
import { screenText, toFlaggedReason } from "../guard"
import { toFetchableUrl } from "../publicFetch"
import { type FetchResult, fetchContent } from "../scrape"

/**
 * Fetch the page for a url Source and screen it with llm-guard, then mark it ready or failed with the reason.
 * A url that cannot be fetched is a rejection, not a warning: its page produces nothing on every future Scan,
 * and the owner should be told so.
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
		await failSource(sourceId, `this page could not be read: ${fetched.message}`)
		return
	}

	// llm-guard screens the fetched Markdown the same way a Resource's content is screened before it is scored
	const screenVerdict = await screenText(fetched.text, "page")
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

// the page's Markdown, or the error that stopped it. every rejection names its own reason to show to the topic's owner
async function fetchPage(pageUrl: string): Promise<FetchResult | Error> {
	// a Source url names a page to read, so it takes the scrape instead of the caption path a video would
	try {
		return await fetchContent(toFetchableUrl(pageUrl).toString(), "read")
	} catch (error) {
		return error instanceof Error ? error : new Error(String(error))
	}
}
