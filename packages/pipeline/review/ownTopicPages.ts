// a topic's own pages on CarlNotes: its page, its podcast episodes, and its Topic Posts, all at paths after
// /topics/<topic id>. other CarlNotes pages, like the docs and the release notes, are not the topic's own

import { SITE_HOST } from "@carlnotes/contracts/site"
import { appBaseUrl } from "@carlnotes/server/appUrl"
import { notInArray, type SQL, type SQLWrapper, sql } from "drizzle-orm"

// the hosts CarlNotes serves its pages on, beside the configured app url's
const CARLNOTES_HOSTS = [SITE_HOST, `www.${SITE_HOST}`]

// the configured host can be a loopback server or a staging deployment
function toCarlNotesHosts(): string[] {
	const appHost = URL.parse(appBaseUrl() ?? "")?.hostname
	return appHost ? [...CARLNOTES_HOSTS, appHost] : CARLNOTES_HOSTS
}

/** Excludes all first-party URLs from retained Journal evidence, including older Findings. */
export function toExternalTopicMemorySourceFilter(url: SQLWrapper): SQL {
	const host = sql<string>`coalesce(rtrim(lower(substring(${url} from '^[a-zA-Z]+://(?:[^/?#]*@)?([^/:?#]+)')), '.'), '')`
	return notInArray(host, toCarlNotesHosts())
}

/** Recognizes CarlNotes-generated material on any Topic, including a recreated copy of another Topic. */
export function isCarlNotesGeneratedContentUrl(url: string): boolean {
	const parsed = URL.parse(url)
	return Boolean(
		parsed &&
			toCarlNotesHosts().includes(parsed.hostname.replace(/\.$/, "")) &&
			/^(?:\/topics\/[^/]+(?:\/[^/]+)?\/(?:episodes|films|posts)|\/(?:episodes|films|posts))(?:\/|$)/i.test(
				parsed.pathname,
			),
	)
}

/**
 * Returns whether a url is one of the topic's own pages on CarlNotes.
 */
export function isOwnTopicPageUrl(url: string, topicId: string): boolean {
	// a url that does not parse is no page of ours
	const parsedUrl = URL.parse(url)
	if (!parsedUrl) {
		return false
	}

	// a page on one of CarlNotes' hosts, after the topic's own path
	const isCarlNotesHost = toCarlNotesHosts().includes(parsedUrl.hostname)
	const topicPath = `/topics/${topicId.toLowerCase()}`
	const urlPath = parsedUrl.pathname.toLowerCase()
	return isCarlNotesHost && (urlPath === topicPath || urlPath.startsWith(`${topicPath}/`))
}
