// the site search's filters in SQL: the topic tags that narrow topics, podcast episodes, and findings, and the
// resource kinds and the view that narrow findings

import { resourceKinds } from "@carlnotes/contracts/enums"
import type { SearchRequest } from "@carlnotes/contracts/search"
import { db, isFindingShown } from "@carlnotes/db"
import { bookmarks, consumptions, findings, resources } from "@carlnotes/db/schema/scans"
import { topics } from "@carlnotes/db/schema/topics"
import { and, arrayContains, arrayOverlaps, eq, exists, inArray, not, notExists, type SQL, sql } from "drizzle-orm"

// the tags a search names and how they match
type TopicTagSearch = Pick<SearchRequest, "tags" | "tagMatch">

/**
 * Returns the filter a topic's tags must pass: any of the tags, all of them, or none of them. A search that names no
 * tags, or turns the match off, filters nothing.
 */
export function toTopicTagFilter({ tags, tagMatch }: TopicTagSearch): SQL | undefined {
	if (tagMatch === "off" || tags.length === 0) {
		return undefined
	}

	// all of the tags, any of them, or none of them
	if (tagMatch === "all") {
		return arrayContains(topics.tags, tags)
	}
	return tagMatch === "any" ? arrayOverlaps(topics.tags, tags) : not(arrayOverlaps(topics.tags, tags))
}

/**
 * Returns whether a search's tags leave out the kinds that have none, teams and profiles: tags that a result must
 * have, any of them or all of them.
 */
export function isTaglessKindLeftOut({ tags, tagMatch }: TopicTagSearch): boolean {
	return tags.length > 0 && (tagMatch === "any" || tagMatch === "all")
}

// the resource kinds and the view a search names, and the user whose marks the view reads
type FindingSearch = Pick<SearchRequest, "resourceKinds" | "view"> & { userId: string | null }

/**
 * Returns the filter a finding must pass: one of the resource kinds, and the view over the findings no one rated thumbs
 * down. Unread and bookmarked read the user's own marks, so a visitor's unread is every finding, and a visitor's
 * bookmarked is none.
 */
export function toFindingFilter({ resourceKinds: searchResourceKinds, view, userId }: FindingSearch): SQL | undefined {
	// every resource kind on filters none
	const isEveryResourceKindOn = resourceKinds.every((resourceKind) => searchResourceKinds.includes(resourceKind))
	const resourceKindFilter = isEveryResourceKindOn ? undefined : inArray(resources.kind, searchResourceKinds)

	// the view's own rule over the shown findings
	return and(resourceKindFilter, toFindingViewFilter(view, userId))
}

// a view's rule: the shown findings, all of them or the ones the user has not read or has bookmarked
function toFindingViewFilter(view: SearchRequest["view"], userId: string | null): SQL | undefined {
	// a visitor has read nothing and bookmarked nothing
	if (view === "all" || (view === "unread" && !userId)) {
		return isFindingShown
	}
	if (!userId) {
		return sql`false`
	}

	// the user's own consumed or bookmark row for the finding
	const userMarkTable = view === "unread" ? consumptions : bookmarks
	const userMark = db
		.select({ findingId: userMarkTable.findingId })
		.from(userMarkTable)
		.where(and(eq(userMarkTable.findingId, findings.id), eq(userMarkTable.userId, userId)))
	return and(isFindingShown, view === "unread" ? notExists(userMark) : exists(userMark))
}
