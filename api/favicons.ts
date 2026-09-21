// a host's stored favicon: the route that serves it, and the path a finding and a link preview name it by
import type { ChatLinkPreview, TopicFinding } from "@shared/contracts"
import { toUrlHost } from "@shared/sources"
import { and, eq, inArray, isNotNull } from "drizzle-orm"
import { Hono } from "hono"
import { db } from "../db"
import { favicons } from "../db/schema"
import { attachmentStream } from "../worker"
import type { AppEnv } from "./currentUser"
import { toStoredFileHeaders } from "./topic/attachments"

// a month. an icon that changes on its site shows up within it
const FAVICON_CACHE_CONTROL = "public, max-age=2592000"

// an icon opened as a page gets a policy that allows nothing and sandboxes the document
const FAVICON_CONTENT_SECURITY_POLICY = "default-src 'none'; style-src 'unsafe-inline'; sandbox"

/**
 * The path this origin serves a host's favicon from.
 */
export function toFaviconPath(host: string): string {
	return `/api/favicons/${encodeURIComponent(host)}`
}

/**
 * Fill each topic finding's faviconPath from its source host, one query for the whole page.
 */
export async function attachTopicFindingFaviconPaths(topicFindings: TopicFinding[]): Promise<void> {
	// the hosts with a stored icon, looked up once for the page
	const hosts = topicFindings.map((topicFinding) => topicFinding.source).filter((host): host is string => host !== null)
	const faviconHosts = await loadFaviconHosts([...new Set(hosts)])
	for (const topicFinding of topicFindings) {
		topicFinding.faviconPath = toStoredFaviconPath(topicFinding.source, faviconHosts)
	}
}

/**
 * Fill each link preview's faviconPath from its url's host, one query for the batch.
 */
export async function attachLinkPreviewFaviconPaths(chatLinkPreviews: ChatLinkPreview[]): Promise<void> {
	// the hosts with a stored icon, looked up once for the batch
	const hosts = chatLinkPreviews
		.map((linkPreview) => toUrlHost(linkPreview.url))
		.filter((host): host is string => host !== null)
	const faviconHosts = await loadFaviconHosts([...new Set(hosts)])
	// each card names its own host's path, or null
	for (const linkPreview of chatLinkPreviews) {
		linkPreview.faviconPath = toStoredFaviconPath(toUrlHost(linkPreview.url), faviconHosts)
	}
}

// the path for a host with a stored icon, null for one without
function toStoredFaviconPath(host: string | null, faviconHosts: Set<string>): string | null {
	return host && faviconHosts.has(host) ? toFaviconPath(host) : null
}

// the hosts among these with a stored icon
async function loadFaviconHosts(hosts: string[]): Promise<Set<string>> {
	// an empty list matches nothing, so skip the query
	if (hosts.length === 0) {
		return new Set()
	}

	// one query for every host on the page
	const faviconRows = await db
		.select({ host: favicons.host })
		.from(favicons)
		.where(and(inArray(favicons.host, hosts), isNotNull(favicons.objectKey)))
	return new Set(faviconRows.map((faviconRow) => faviconRow.host))
}

// serve a host's stored icon from this origin, cacheable for a month
export const faviconsRoute = new Hono<AppEnv>().get("/favicons/:host", async (context) => {
	// the stored object and its type, for the host the path names
	const [faviconRow] = await db
		.select({ objectKey: favicons.objectKey, contentType: favicons.contentType })
		.from(favicons)
		.where(eq(favicons.host, context.req.param("host")))
	// a host with no row or no stored icon has nothing to serve
	if (!faviconRow?.objectKey || !faviconRow.contentType) {
		return context.json({ error: "not found" }, 404)
	}
	return context.body(attachmentStream(faviconRow.objectKey), 200, {
		...toStoredFileHeaders("favicon", faviconRow.contentType),
		"Cache-Control": FAVICON_CACHE_CONTROL,
		"Content-Security-Policy": FAVICON_CONTENT_SECURITY_POLICY,
		// only this origin's pages can embed an icon
		"Cross-Origin-Resource-Policy": "same-origin",
	})
})
