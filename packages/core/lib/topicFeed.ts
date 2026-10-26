import { resourceKinds as allResourceKinds } from "@carlnotes/contracts/enums"
import type { TagMatchMode, TopicFinding, TopicFindingFilter, TopicFindingSort } from "@carlnotes/contracts/findings"
import type { TopicFeedResponse } from "@carlnotes/contracts/topics"
import { matchesTopicFindingFilter } from "./topicFindingFilters"
import { toSortedTopicFindings } from "./topicFindingSorts"
import { toSortedSectionTopics } from "./topicSorts"

// the feed's selected kinds, view, sort, and bookmark ownership
export type ResourceKind = (typeof allResourceKinds)[number]
export type TopicFindingSelection = {
	resourceKinds: Set<ResourceKind>
	findingFilter: TopicFindingFilter
	sort: TopicFindingSort
	bookmarkScope?: "mine" | "team"
}
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
			resourceKinds.has(finding.resourceKind) && matchesTopicFindingFilter(finding, findingFilter, bookmarkScope),
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
