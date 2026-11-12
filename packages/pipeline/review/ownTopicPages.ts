// a topic's own pages on CarlNotes: its page, its podcast episodes, and its Topic Posts, all at paths after
// /topics/<topic id>. other CarlNotes pages, like the docs and the release notes, are not the topic's own

import { SITE_HOST } from "@carlnotes/contracts/site"
import { appBaseUrl } from "@carlnotes/server/appUrl"

// the hosts CarlNotes serves its pages on, beside the configured app url's
const CARLNOTES_HOSTS = [SITE_HOST, `www.${SITE_HOST}`]

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
	const appHost = URL.parse(appBaseUrl() ?? "")?.host
	const isCarlNotesHost = CARLNOTES_HOSTS.includes(parsedUrl.host) || parsedUrl.host === appHost
	const topicPath = `/topics/${topicId.toLowerCase()}`
	const urlPath = parsedUrl.pathname.toLowerCase()
	return isCarlNotesHost && (urlPath === topicPath || urlPath.startsWith(`${topicPath}/`))
}
