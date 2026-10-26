import type { TopicPageResult } from "@carlnotes/client/topicClient"
import type { TopicFinding } from "@carlnotes/contracts/findings"
import type { SearchResultsPage } from "@carlnotes/contracts/search"
import type { TopicDetails, TopicFeedResponse } from "@carlnotes/contracts/topics"

// each action owns only the fields it changes
export type TopicFindingChange = { findingId: string } & (
	| { kind: "opened" }
	| { kind: "consumed"; isConsumed: boolean }
	| { kind: "bookmark"; isBookmarked: boolean }
	| { kind: "rating"; rating: "up" | "down" | null }
)

/**
 * Applies confirmed or tentative changes to every occurrence of a finding in the feed.
 */
export function applyTopicFeedChanges(
	topicFeed: TopicFeedResponse | null,
	changes: TopicFindingChange[],
): TopicFeedResponse | null {
	if (!topicFeed || changes.length === 0) {
		return topicFeed
	}
	return {
		...topicFeed,
		sections: topicFeed.sections.map((section) => ({
			...section,
			topics: section.topics.map((topic) => applyTopicFindingChanges(topic, changes)),
		})),
	}
}

/**
 * Applies finding changes to a visible topic page while preserving access results.
 */
export function applyTopicPageChanges(
	topicPage: TopicPageResult | undefined,
	changes: TopicFindingChange[],
): TopicPageResult | undefined {
	if (topicPage?.status !== "visible" || changes.length === 0) {
		return topicPage
	}
	return { ...topicPage, topic: applyTopicFindingChanges(topicPage.topic, changes) }
}

/**
 * Applies the same finding changes to search results while preserving their ranks and other kinds.
 */
export function applySearchFindingChanges(
	searchPage: SearchResultsPage,
	changes: TopicFindingChange[],
): SearchResultsPage {
	if (changes.length === 0) {
		return searchPage
	}
	// update only finding rows that have an action in flight or acknowledged
	const rows = searchPage.rows.map((row) => {
		if (row.kind !== "finding") {
			return row
		}
		const finding = applyFindingChanges(row.finding, changes)
		return finding === row.finding ? row : { ...row, finding }
	})
	return { ...searchPage, rows }
}

/**
 * Changes matching findings and adjusts the topic's unread count by the changed rows.
 */
export function applyTopicFindingChanges<Topic extends TopicDetails>(
	topic: Topic,
	changes: TopicFindingChange[],
): Topic {
	// combine independent actions before calculating each finding's unread difference
	let unreadDifference = 0
	const findings = topic.findings.map((finding) => {
		const changedFinding = applyFindingChanges(finding, changes)
		unreadDifference += Number(isUnreadFinding(changedFinding)) - Number(isUnreadFinding(finding))
		return changedFinding
	})
	return { ...topic, findings, newCount: Math.max(0, topic.newCount + unreadDifference) }
}

/**
 * Applies all matching actions to a finding in their submitted order.
 */
export function applyFindingChanges(finding: TopicFinding, changes: TopicFindingChange[]): TopicFinding {
	return changes.reduce(
		(changedFinding, change) =>
			change.findingId === finding.findingId ? applyFindingChange(changedFinding, change) : changedFinding,
		finding,
	)
}

/**
 * Changes only the fields owned by a finding action.
 */
export function applyFindingChange(finding: TopicFinding, change: TopicFindingChange): TopicFinding {
	switch (change.kind) {
		case "opened":
			return { ...finding, isConsumed: true, viewCount: finding.viewCount + 1 }
		case "consumed":
			return { ...finding, isConsumed: change.isConsumed }
		case "bookmark":
			return { ...finding, isBookmarked: change.isBookmarked }
		case "rating":
			return { ...finding, rating: change.rating }
	}
}

// count visible unread findings
function isUnreadFinding(finding: TopicFinding): boolean {
	return !finding.isConsumed && finding.rating !== "down"
}
