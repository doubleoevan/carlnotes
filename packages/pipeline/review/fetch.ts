// the content fetch for one Resource to score: its stored text reused or revalidated, or the page fetched fresh and
// stored, with the fields that fetch writes to the Resource row

import { toUrlHost } from "@carlnotes/contracts/sources"
import { db } from "@carlnotes/db"
import { resources } from "@carlnotes/db/schema/scans"
import {
	deleteStoredObject,
	getResourceContent,
	toResourceContentKey,
	uploadResourceContent,
} from "@carlnotes/db/store"
import { type Budget, charge, type FetchOutcome } from "@carlnotes/models/budget"
import { reportError } from "@carlnotes/server/monitoring"
import { eq } from "drizzle-orm"
import { fetchAndStoreHostFavicon } from "../favicons"
import { isTitleFromUrlFallback } from "../ingest/normalize"
import { CONTENT_TTL_MS, fetchContent, isContentStale, revalidateContent } from "../scrape"
import type { Resource } from "./filter"

// how a tweet's canonical url always starts, where ingestion folds twitter.com onto x.com and lowercases the host
const X_URL_PREFIX = "https://x.com/"

/**
 * Returns the Resource's content to score, and whether it was reused from storage, revalidated, or fetched.
 */
export async function fetchResourceContent(
	resource: Resource,
	budget: Budget,
): Promise<{ content: string; fetchOutcome: FetchOutcome }> {
	// a Resource whose snippet is already its whole text needs no fetch. it counts as reused, which charges no fetch credit
	if (isSnippetComplete(resource.url)) {
		return { content: resource.snippet ?? "", fetchOutcome: "reused" }
	}

	// reuse stored content scores as-is if it isn't stale, read back from object storage, with no fetch
	if (resource.contentKey && !isContentStale(resource.fetchedAt, new Date(), CONTENT_TTL_MS)) {
		const storedContent = await readStoredContent(resource.contentKey, resource.id)
		if (storedContent !== null) {
			return { content: storedContent, fetchOutcome: "reused" }
		}
	}

	// revalidate stale content with a cheap conditional GET. 304 reuses it and refreshes the fetched_at timestamp
	if (resource.contentKey && (resource.etag || resource.lastModified)) {
		const outcome = await revalidateContent(resource.url, { etag: resource.etag, lastModified: resource.lastModified })
		const storedContent = outcome === "not-modified" ? await readStoredContent(resource.contentKey, resource.id) : null
		if (storedContent !== null) {
			await db.update(resources).set({ fetchedAt: new Date() }).where(eq(resources.id, resource.id))
			return { content: storedContent, fetchOutcome: "revalidated" }
		}
	}

	// fetch fresh content, storing it along with the etag and last-modified
	return fetchAndStoreContent(resource, budget)
}

// read a Resource's stored text or null if the object is gone or unreadable
async function readStoredContent(contentKey: string, resourceId: string): Promise<string | null> {
	try {
		return await getResourceContent(contentKey)
	} catch (error) {
		// a read that fails turns into a paid refetch, so a rising rate here costs money
		console.error(`object-storage read failed for resource ${resourceId}`, error)
		reportError(error, "object-storage", { resourceId, contentKey, operation: "read" })
		return null
	}
}

// fetch the content by the path the Resource's kind selects, write it to object storage
async function fetchAndStoreContent(
	resource: Resource,
	budget: Budget,
): Promise<{ content: string; fetchOutcome: FetchOutcome }> {
	try {
		// fetch the content, charge what that fetch spent, then write the body to object storage
		const { text, cost, etag, lastModified, title, faviconUrl } = await fetchContent(
			resource.url,
			resource.kind,
			resource.transcriptUrl,
		)
		charge(budget, "fetch", cost)
		const stored = text ? await storeResourceContent(resource.id, text) : null

		// the text to score and the key to store, plus the title when the stored one came from the url
		const { scoringText, contentKey, contentBytes } = toFetchedContentFields(stored, text, resource.snippet)
		const pageTitleField = toPageTitleField(resource, title)

		// store the resource row
		await db
			.update(resources)
			.set({ contentKey, contentBytes, etag, lastModified, fetchedAt: new Date(), ...pageTitleField })
			.where(eq(resources.id, resource.id))

		// the page's host gets its favicon beside the score, never ahead of it
		const host = toUrlHost(resource.url)
		if (host) {
			void fetchAndStoreHostFavicon(host, faviconUrl)
		}
		return { content: scoringText, fetchOutcome: "fetched" }
	} catch (error) {
		// the fetch failed, so fall back to the snippet. the Finding is still written, with less to go on
		console.error(`content fetch failed for ${resource.url}`, error)
		reportError(error, "fetch", { resourceId: resource.id, url: resource.url })
		return { content: resource.snippet ?? "", fetchOutcome: "fetched" }
	}
}

// write the fetched text to object storage, returning its key and size, or null if the write fails
async function storeResourceContent(
	resourceId: string,
	text: string,
): Promise<{ contentKey: string; bytes: number } | null> {
	try {
		return await uploadResourceContent(resourceId, text)
	} catch (error) {
		// the write failed
		console.error(`object-storage write failed for resource ${resourceId}`, error)
		reportError(error, "object-storage", { resourceId, operation: "write" })
		await deleteStoredObject(toResourceContentKey(resourceId))
		return null
	}
}

/**
 * Whether the Resource's snippet is already its whole text, so fetching the page would add nothing.
 * A tweet is the only one today, and x.com rejects scraping, so a fetch there is billed only to fail.
 */
export function isSnippetComplete(url: string): boolean {
	return url.startsWith(X_URL_PREFIX)
}

/**
 * The title field a fetch writes, which is the page's own title if the stored one was taken from the url.
 * An empty object leaves the stored title alone.
 */
export function toPageTitleField(
	resource: Pick<Resource, "title" | "url">,
	pageTitle: string | null,
): { title?: string } {
	return pageTitle && isTitleFromUrlFallback(resource.title, resource.url) ? { title: pageTitle } : {}
}

/**
 * The fields that a fetch writes to the Resource row, plus the text it scores. A body written to object storage
 * is scored in memory and keeps its key. An empty fetch or a failed write scores the snippet instead and keeps no key.
 */
export function toFetchedContentFields(
	stored: { contentKey: string; bytes: number } | null,
	text: string,
	snippet: string | null,
): { scoringText: string; contentKey: string | null; contentBytes: number | null } {
	return {
		scoringText: stored ? text : (snippet ?? ""),
		contentKey: stored?.contentKey ?? null,
		contentBytes: stored?.bytes ?? null,
	}
}
