import type { TopicPageResult } from "@carlnotes/client/topicClient"
import type { TopicFinding } from "@carlnotes/contracts/findings"
import type { PodcastEpisodePageResponse } from "@carlnotes/contracts/podcastEpisodePage"
import type { SearchResultsPage } from "@carlnotes/contracts/search"
import type { ReactionSummary } from "@carlnotes/contracts/social"
import type { TopicDetails, TopicFeedResponse } from "@carlnotes/contracts/topics"
import type { UpdatesResponse } from "@carlnotes/contracts/updates"
import { matchesTopicFindingFilter } from "./topicFindingFilters"

// each action owns only the fields it changes
export type TopicFindingChange = { findingId: string } & (
	| { kind: "opened" }
	| { kind: "consumed"; isConsumed: boolean }
	| { kind: "bookmark"; isBookmarked: boolean }
	| { kind: "rating"; rating: "up" | "down" | null }
	| { kind: "reactions"; reactions: ReactionSummary }
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
 * Applies finding changes to a podcast episode page's findings and leaves the rest of the page as it was.
 */
export function applyPodcastEpisodePageChanges(
	podcastEpisodePage: PodcastEpisodePageResponse,
	changes: TopicFindingChange[],
): PodcastEpisodePageResponse {
	return {
		...podcastEpisodePage,
		topicFindings: podcastEpisodePage.topicFindings.map((finding) => applyFindingChanges(finding, changes)),
	}
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

		// a row no change touched stays the same object
		const finding = applyFindingChanges(row.finding, changes)
		return finding === row.finding ? row : { ...row, finding }
	})
	return { ...searchPage, rows }
}

/**
 * Applies finding changes to an updates list while preserving its order.
 */
export function applyUpdatesFindingChanges(updates: UpdatesResponse, changes: TopicFindingChange[]): UpdatesResponse {
	if (changes.length === 0) {
		return updates
	}
	return { ...updates, findings: updates.findings.map((finding) => applyFindingChanges(finding, changes)) }
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

		// the count follows the unread view, which leaves out a finding rated thumbs down
		unreadDifference +=
			Number(matchesTopicFindingFilter(changedFinding, "unread")) - Number(matchesTopicFindingFilter(finding, "unread"))
		return changedFinding
	})
	return { ...topic, findings, newCount: Math.max(0, topic.newCount + unreadDifference) }
}

/**
 * Applies all matching actions to a finding in their submitted order.
 */
export function applyFindingChanges<Finding extends TopicFinding>(
	finding: Finding,
	changes: TopicFindingChange[],
): Finding {
	return changes.reduce(
		(changedFinding, change) =>
			change.findingId === finding.findingId ? applyFindingChange(changedFinding, change) : changedFinding,
		finding,
	)
}

/**
 * Changes only the fields owned by a finding action.
 */
export function applyFindingChange<Finding extends TopicFinding>(
	finding: Finding,
	change: TopicFindingChange,
): Finding {
	switch (change.kind) {
		// an open marks the finding read and counts the view
		case "opened":
			return { ...finding, isConsumed: true, viewCount: finding.viewCount + 1 }

		// a read or a bookmark sets the one flag it names
		case "consumed":
			return { ...finding, isConsumed: change.isConsumed }
		case "bookmark":
			return { ...finding, isBookmarked: change.isBookmarked }

		// a rating or a saved reaction summary replaces the finding's own
		case "rating":
			return { ...finding, rating: change.rating }
		case "reactions":
			return { ...finding, reactions: change.reactions }
	}
}
