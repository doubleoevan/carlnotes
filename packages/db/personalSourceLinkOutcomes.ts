import { toCanonicalUrl } from "@carlnotes/contracts/canonicalUrl"
import type { PersonalSourceEntry, PersonalSourceLinkOutcome } from "@carlnotes/contracts/personalSources"
import { and, eq, inArray } from "drizzle-orm"
import { db, isFindingShown } from "./index"
import { personalSourcesLinks } from "./schema/personalSources"
import { findings, resources } from "./schema/scans"

/**
 * Loads Topic-local link results in two bounded queries for an already sender-authorized page.
 */
export async function loadPersonalSourceLinkOutcomes(entries: PersonalSourceEntry[]): Promise<PersonalSourceEntry[]> {
	if (entries.length === 0) {
		return entries
	}
	// page bounds limit the entry IDs and the public candidate URLs in these reads
	const topicId = entries[0]?.topicId ?? ""
	const urls = [...new Set(entries.flatMap((entry) => entry.links.map(toCanonicalUrl)))]
	const links = await db
		.select()
		.from(personalSourcesLinks)
		.where(
			inArray(
				personalSourcesLinks.entryId,
				entries.map((entry) => entry.id),
			),
		)
	const pages = urls.length
		? await db
				.select({ url: resources.url, id: findings.id, title: resources.title })
				.from(resources)
				.leftJoin(findings, and(eq(findings.resourceId, resources.id), eq(findings.topicId, topicId), isFindingShown))
				.where(inArray(resources.url, urls))
		: []
	const pagesByUrl = new Map(pages.map((page) => [page.url, page]))
	const linksByPosition = new Map(links.map((link) => [`${link.entryId}:${link.position}`, link]))
	return entries.map((entry) => ({
		...entry,
		linkOutcomes: entry.links.map((url, position): PersonalSourceLinkOutcome => {
			// a visible Finding in this Topic takes precedence over an earlier review result
			const page = pagesByUrl.get(toCanonicalUrl(url))
			const linkDetails = toLinkDetails({ url, title: page?.title })
			const findingId = page?.id
			if (findingId) {
				return {
					...linkDetails,
					status: "finding",
					findingId,
					href: `/topics/${encodeURIComponent(topicId)}?finding=${encodeURIComponent(findingId)}`,
				}
			}
			const link = linksByPosition.get(`${entry.id}:${position}`)
			if (!link) {
				return { ...linkDetails, status: "not_scored", reason: "Not queued for review" }
			}
			if (link.state !== "considered") {
				return { ...linkDetails, status: "queued" }
			}
			return link.reviewOutcome === "scored"
				? { ...linkDetails, status: "scored" }
				: { ...linkDetails, status: "not_scored", reason: link.reviewReason ?? "Reviewed; no score recorded" }
		}),
	}))
}

// preserve the full URL when no stored page title is available
function toLinkDetails({
	url,
	title,
}: {
	url: string
	title?: string | null
}): Pick<PersonalSourceLinkOutcome, "url" | "title"> {
	const pageTitle = title?.trim()
	return pageTitle ? { url, title: pageTitle } : { url }
}
