import type { TopicFinding } from "@carlnotes/contracts/findings"
import type { TopicDetails, TopicFeedResponse, TopicSectionKey } from "@carlnotes/contracts/topics"
import { EMPTY_FILTERED_FINDINGS, EMPTY_TOPIC_FINDINGS, EMPTY_TOPIC_SECTION } from "@carlnotes/core/lib/topicFeedLabels"

// one recycled list contains headings, finding cards, empty lines, and expansion buttons
export type TopicFeedRow = { key: string } & (
	| { kind: "section"; sectionKey: TopicSectionKey; topicCount: number; isExpanded: boolean }
	| { kind: "topic"; topic: TopicDetails }
	| { kind: "findings"; topic: TopicDetails; findingRows: TopicFindingRow[] }
	| { kind: "empty"; text: string }
	| { kind: "more"; topicKey: string; findingCount: number; isExpanded: boolean }
)
type ToTopicPreviewRowsOptions = {
	topic: TopicDetails
	sectionKey: TopicSectionKey
	expandedTopicKeys?: ReadonlySet<string>
}
type ToTopicFeedRowsOptions = {
	topicFeed: TopicFeedResponse
	openSection: TopicSectionKey | null
	expandedTopicKeys?: ReadonlySet<string>
}
export type TopicFindingRow = {
	finding: TopicFinding
	topicFindingRank: number | null
	isLast: boolean
}

/**
 * Flattens Home into distinct recycling types with identity scoped to its section.
 */
export function toTopicFeedRows({ topicFeed, openSection, expandedTopicKeys }: ToTopicFeedRowsOptions): TopicFeedRow[] {
	const rows: TopicFeedRow[] = []
	for (const section of topicFeed.sections) {
		// keep every section reachable while only one is expanded
		rows.push({
			key: section.key,
			kind: "section",
			sectionKey: section.key,
			topicCount: section.topics.length,
			isExpanded: section.key === openSection,
		})
		if (section.key !== openSection) {
			continue
		}
		if (section.topics.length === 0) {
			rows.push({ key: `${section.key}:empty`, kind: "empty", text: EMPTY_TOPIC_SECTION })
		}
		for (const topic of section.topics) {
			rows.push(...toTopicPreviewRows({ topic, sectionKey: section.key, expandedTopicKeys }))
		}
	}
	return rows
}

/**
 * Selects Featured for visitors and the account's initial Topic section.
 */
export function toInitialTopicSection(topicFeed: TopicFeedResponse): TopicSectionKey {
	// the public feed has no account-owned section
	if (!topicFeed.sections.some((section) => section.key === "yours")) {
		return "featured"
	}
	// the web's first-open-section rule
	const ownTopicCount = topicFeed.sections.find((section) => section.key === "yours")?.topics.length ?? 0
	const subscribedTopicCount = topicFeed.sections.find((section) => section.key === "subscribed")?.topics.length ?? 0
	return ownTopicCount === 0 && subscribedTopicCount > 0 ? "subscribed" : "yours"
}

/**
 * Numbers unpinned findings and marks the last separator in their shared card.
 */
export function toTopicFindingRows(findings: TopicFinding[]): TopicFindingRow[] {
	let topicFindingRank = 0
	return findings.map((finding, i) => {
		// bookmarks occupy the rank slot without consuming a number
		if (!finding.isBookmarked) {
			topicFindingRank += 1
		}
		return {
			finding,
			topicFindingRank: finding.isBookmarked ? null : topicFindingRank,
			isLast: i === findings.length - 1,
		}
	})
}

// show five findings until the user expands this topic in place
function toTopicPreviewRows({ topic, sectionKey, expandedTopicKeys }: ToTopicPreviewRowsOptions): TopicFeedRow[] {
	// include the section in every key when a topic occurs in more than one section
	const prefix = `${sectionKey}:${topic.id}`
	const rows: TopicFeedRow[] = [{ key: prefix, kind: "topic", topic }]
	const isExpanded = expandedTopicKeys?.has(prefix) ?? false
	const previewFindings = isExpanded ? topic.findings : topic.findings.slice(0, 5)
	if (previewFindings.length > 0) {
		rows.push({ key: `${prefix}:findings`, kind: "findings", topic, findingRows: toTopicFindingRows(previewFindings) })
	}
	if (previewFindings.length === 0) {
		rows.push({
			key: `${prefix}:empty`,
			kind: "empty",
			text: topic.lastScanAt ? EMPTY_FILTERED_FINDINGS : EMPTY_TOPIC_FINDINGS,
		})
	}
	if (topic.findings.length > 5) {
		rows.push({
			key: `${prefix}:more`,
			kind: "more",
			topicKey: prefix,
			findingCount: topic.findings.length - 5,
			isExpanded,
		})
	}
	return rows
}
