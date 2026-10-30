import { resourceKinds as allResourceKinds, UNKNOWN_CASE } from "@carlnotes/contracts/enums"
import type { TagMatchMode, TopicFinding, TopicFindingFilter, TopicFindingSort } from "@carlnotes/contracts/findings"
import type { TopicFeedResponse } from "@carlnotes/contracts/topics"
import { matchesTopicFindingFilter } from "./topicFindingFilters"
import { toSortedTopicFindings } from "./topicFindingSorts"
import { toSortedSectionTopics } from "./topicSorts"

export type ResourceKind = (typeof allResourceKinds)[number]

/**
 * Returns whether a Finding's resource kind passes the kind filter. An unknown kind passes while every kind is
 * selected.
 */
export function isResourceKindSelected(
	resourceKind: TopicFinding["resourceKind"],
	resourceKinds: Set<ResourceKind>,
): boolean {
	// an unknown kind passes only while every kind is selected
	if (resourceKind === UNKNOWN_CASE) {
		// every kind selected is no filter at all
		return resourceKinds.size === allResourceKinds.length
	}
	return resourceKinds.has(resourceKind)
}

// the feed's selected kinds, view, sort, and bookmark ownership
export type TopicFindingSelection = {
	resourceKinds: Set<ResourceKind>
	findingFilter: TopicFindingFilter
	sort: TopicFindingSort
	bookmarkScope?: "mine" | "team"
}

// what each helper takes beside the selection
export type SelectTopicFindingsOptions = TopicFindingSelection & { findings: TopicFinding[] }
type MatchesTagFiltersOptions = { topicTags: string[]; tagFilters: string[]; tagMatchMode: TagMatchMode }
type ToggleTopicResourceKindOptions = { resourceKinds: Set<ResourceKind>; resourceKind: ResourceKind }
export type FilterTopicFeedOptions = TopicFindingSelection & {
	topicFeed: TopicFeedResponse | null
	tagFilters: string[]
	tagMatchMode: TagMatchMode
}

/**
 * Selects and orders the feed's topics and findings.
 */
export function filterTopicFeed({
	topicFeed,
	tagFilters,
	tagMatchMode,
	...selection
}: FilterTopicFeedOptions): TopicFeedResponse | null {
	if (!topicFeed) {
		return null
	}

	// select each section's topics before ordering their findings
	const sections = topicFeed.sections.map((section) => {
		const matchingTopics = section.topics.filter((topic) =>
			matchesTagFilters({ topicTags: topic.tags, tagFilters, tagMatchMode }),
		)
		const selectedTopics = matchingTopics.map((topic) => ({
			...topic,
			findings: selectTopicFindings({ findings: topic.findings, ...selection }),
		}))
		return { key: section.key, topics: toSortedSectionTopics(section.key, selectedTopics, selection.sort) }
	})
	return { ...topicFeed, sections }
}

/**
 * Selects findings with the shared view and bookmark rules, then orders them.
 */
export function selectTopicFindings({
	findings,
	resourceKinds,
	findingFilter,
	sort,
	bookmarkScope = "mine",
}: SelectTopicFindingsOptions): TopicFinding[] {
	// filter before pinning and sorting
	const matchingFindings = findings.filter(
		(finding) =>
			isResourceKindSelected(finding.resourceKind, resourceKinds) &&
			matchesTopicFindingFilter(finding, findingFilter, bookmarkScope),
	)
	return toSortedTopicFindings(matchingFindings, sort)
}

/**
 * Tests a topic's tags against the selected match mode.
 */
export function matchesTagFilters({ topicTags, tagFilters, tagMatchMode }: MatchesTagFiltersOptions): boolean {
	if (tagMatchMode === "off" || tagFilters.length === 0) {
		return true
	}

	// count the matches for any, all, or exclusion
	const matchedTagCount = tagFilters.filter((tag) => topicTags.includes(tag)).length
	if (tagMatchMode === "any") {
		return matchedTagCount > 0
	}

	// all needs every tag, and exclusion needs none
	if (tagMatchMode === "all") {
		return matchedTagCount === tagFilters.length
	}
	return matchedTagCount === 0
}

/**
 * Toggles a resource kind, restoring all kinds when the selection becomes empty.
 */
export function toggleTopicResourceKind({
	resourceKinds,
	resourceKind,
}: ToggleTopicResourceKindOptions): Set<ResourceKind> {
	// flip the selected kind on a fresh set
	const nextResourceKinds = new Set(resourceKinds)
	if (nextResourceKinds.has(resourceKind)) {
		nextResourceKinds.delete(resourceKind)
	} else {
		nextResourceKinds.add(resourceKind)
	}
	return nextResourceKinds.size === 0 ? new Set(allResourceKinds) : nextResourceKinds
}

/**
 * Returns how many topics a section of the feed has, or null while the feed is still loading.
 */
export function toSectionTopicCount(topicFeed: TopicFeedResponse | null, sectionKey: string): number | null {
	return topicFeed?.sections.find((section) => section.key === sectionKey)?.topics.length ?? null
}

/**
 * Returns whether a loaded feed belongs to a user who owns and follows no topics.
 */
export function isUserTopicFeedEmpty(topicFeed: TopicFeedResponse | null): boolean {
	return toSectionTopicCount(topicFeed, "yours") === 0 && toSectionTopicCount(topicFeed, "subscribed") === 0
}
