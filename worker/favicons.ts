// a host's favicon: fetched once when review reads a page on the host, kept for every place the host is named
import { reportError } from "@shared/monitoring"
import { eq } from "drizzle-orm"
import { db } from "../db"
import { favicons } from "../db/schema"
import { fetchLinkPreviewImage, type LinkPreviewImage, PREVIEW_IMAGE_TYPES } from "./linkPreview"
import { toFaviconKey, uploadAttachment } from "./store"

// how long a fetch is kept, failed or not, before a page on the host fetches the icon again
export const FAVICON_TTL_MS = 30 * 24 * 60 * 60 * 1000

// an ico with every size runs to a quarter megabyte. one past this is not worth serving on every row
export const MAX_FAVICON_BYTES = 256 * 1024

// the image types an icon may be: the link preview types, ico, and svg
export const FAVICON_IMAGE_TYPES = new Set([
	...PREVIEW_IMAGE_TYPES,
	"image/x-icon",
	"image/vnd.microsoft.icon",
	"image/svg+xml",
])

// the favicon row's stored icon columns
type StoredFavicon = { objectKey: string | null; contentType: string | null }

// each host's fetch under way, so pages reviewed side by side on one host share one
const faviconFetchesByHost = new Map<string, Promise<void>>()

/**
 * Whether a host's icon is due for a fetch: no row yet, or one fetched longer ago than the ttl.
 */
export function isFaviconFetchDue(fetchedAt: Date | null, now: Date): boolean {
	return fetchedAt === null || now.getTime() - fetchedAt.getTime() > FAVICON_TTL_MS
}

/**
 * The urls to try for a host's icon, in order: favicon.ico at the host's root, the icon the page named, the root svg
 * and touch icon, then the three root icons at the host's www or bare spelling.
 */
export function toFaviconCandidateUrls(host: string, faviconUrl: string | null): string[] {
	const [rootFaviconUrl, ...otherRootFaviconUrls] = toRootFaviconUrls(host)
	const siblingHost = host.startsWith("www.") ? host.slice("www.".length) : `www.${host}`
	const candidateUrls = [rootFaviconUrl, faviconUrl, ...otherRootFaviconUrls, ...toRootFaviconUrls(siblingHost)]
	return [...new Set(candidateUrls.filter((url): url is string => url !== null))]
}

// the three icons a host may serve at its root
function toRootFaviconUrls(host: string): string[] {
	return [`https://${host}/favicon.ico`, `https://${host}/favicon.svg`, `https://${host}/apple-touch-icon.png`]
}

/**
 * The row's fields after a fetch: the icon fetched, or after a failed fetch the icon already stored, and when.
 */
export function toFaviconFields(
	host: string,
	storedFavicon: StoredFavicon | undefined,
	favicon: LinkPreviewImage | null,
	now: Date,
): StoredFavicon & { fetchedAt: Date } {
	return {
		objectKey: favicon ? toFaviconKey(host) : (storedFavicon?.objectKey ?? null),
		contentType: favicon ? favicon.contentType : (storedFavicon?.contentType ?? null),
		fetchedAt: now,
	}
}

/**
 * Wait for every favicon fetch under way, so a review batch ends with its icons stored.
 */
export async function settleFaviconFetches(): Promise<void> {
	await Promise.all(faviconFetchesByHost.values())
}

/**
 * Fetch and store the host's favicon when it is due. A failed fetch still writes the row, keeping any icon already stored, so
 * the host waits out the ttl instead of costing a fetch on every scan. Never throws.
 */
export function fetchAndStoreHostFavicon(host: string, faviconUrl: string | null): Promise<void> {
	// a fetch already under way for the host is the one to wait for
	const pendingFaviconFetch = faviconFetchesByHost.get(host)
	if (pendingFaviconFetch) {
		return pendingFaviconFetch
	}
	const faviconFetch = fetchAndStoreFaviconWhenDue(host, faviconUrl).finally(() => faviconFetchesByHost.delete(host))
	faviconFetchesByHost.set(host, faviconFetch)
	return faviconFetch
}

// the fetch and store: the due check, the first candidate that fetches, the store, and the row
async function fetchAndStoreFaviconWhenDue(host: string, faviconUrl: string | null): Promise<void> {
	try {
		// a row inside the ttl, failed or not, is kept
		const [faviconRow] = await db
			.select({ objectKey: favicons.objectKey, contentType: favicons.contentType, fetchedAt: favicons.fetchedAt })
			.from(favicons)
			.where(eq(favicons.host, host))
		if (!isFaviconFetchDue(faviconRow?.fetchedAt ?? null, new Date())) {
			return
		}

		// the first candidate that passes the guard, the types, and the size limit
		const favicon = await fetchFirstFavicon(host, toFaviconCandidateUrls(host, faviconUrl))

		// an icon whose upload fails counts as a failed fetch, so the host waits out the ttl like any other
		const uploadedFavicon = favicon && (await uploadFavicon(host, favicon)) ? favicon : null

		// the row records the icon, or the failed fetch with whatever was stored before
		const faviconFields = toFaviconFields(host, faviconRow, uploadedFavicon, new Date())
		await db
			.insert(favicons)
			.values({ host, ...faviconFields })
			.onConflictDoUpdate({ target: favicons.host, set: faviconFields })
	} catch (error) {
		// the scan that read the page goes on without the icon
		console.error(`favicon fetch failed for ${host}`, error)
		reportError(error, "fetch", { host })
	}
}

// whether the icon reached object storage. a failed upload is logged and reported
async function uploadFavicon(host: string, favicon: LinkPreviewImage): Promise<boolean> {
	try {
		await uploadAttachment(toFaviconKey(host), favicon.bytes, favicon.contentType)
		return true
	} catch (error) {
		console.error(`favicon upload failed for ${host}`, error)
		reportError(error, "object-storage", { host })
		// the icon counts as not stored, and is fetched again after the ttl
		return false
	}
}

// the first candidate that comes back as an icon, or null when none does. a rejected candidate is expected, so it
// logs one line
async function fetchFirstFavicon(host: string, candidateUrls: string[]): Promise<LinkPreviewImage | null> {
	for (const candidateUrl of candidateUrls) {
		try {
			return await fetchLinkPreviewImage(candidateUrl, MAX_FAVICON_BYTES, FAVICON_IMAGE_TYPES)
		} catch (error) {
			console.warn(`favicon ${candidateUrl} for ${host}: ${error instanceof Error ? error.message : String(error)}`)
		}
	}
	// every candidate was rejected
	return null
}
