import {
	PERSONAL_SOURCES_ITEMS_PER_PAGE,
	type PersonalSource,
	type PersonalSourceEntry,
	type PersonalSourceLinkOutcome,
	type TopicPersonalSources,
} from "@carlnotes/contracts/personalSources"
import { toTestTopicFinding, toTestTopicResponse } from "@carlnotes/contracts/topicFeedTestFixtures"
import { useState } from "react"
import type { PersonalSourceState } from "../hooks/usePersonalSource"
import type { TopicPersonalSourcesContentsState } from "../hooks/useTopicPersonalSourcesContents"
import { PERSONAL_SOURCES_CONVERSATION_EXAMPLES } from "./personalSourcesConversationStories"

/**
 * Supplies the same complete personal sources states to both platforms without live private data.
 */
export function useTopicPersonalSourcesStory(
	variant: "ready" | "empty" | "loading" | "failed" | "long" | "paged" | "page2" = "ready",
	conversationExample?: keyof typeof PERSONAL_SOURCES_CONVERSATION_EXAMPLES,
): TopicPersonalSourcesContentsState {
	// retain only the current fixture page and confirmation
	const [requestedPage, setRequestedPage] = useState(variant === "page2" ? 2 : 1)
	const [deletedIds, setDeletedIds] = useState<string[]>([])
	const [confirmation, setConfirmation] = useState<PersonalSourceEntry | null>(null)
	const allEntries = (
		variant === "empty"
			? []
			: variant === "paged" || variant === "page2"
				? PAGED_ENTRIES
				: PERSONAL_SOURCES_ENTRIES_STORY
	).filter((entry) => !deletedIds.includes(entry.id))
	const pageCount = Math.max(1, Math.ceil(allEntries.length / PERSONAL_SOURCES_ITEMS_PER_PAGE))
	const pageNumber = Math.min(requestedPage, pageCount)
	const entryOffset = (pageNumber - 1) * PERSONAL_SOURCES_ITEMS_PER_PAGE
	const entries = allEntries.slice(entryOffset, entryOffset + PERSONAL_SOURCES_ITEMS_PER_PAGE).map((entry) => ({
		...entry,
		text: variant === "long" ? entry.text.repeat(70) : entry.text,
		chatUrl: conversationExample ? PERSONAL_SOURCES_CONVERSATION_EXAMPLES[conversationExample].href : entry.chatUrl,
		sender: conversationExample ? PERSONAL_SOURCES_CONVERSATION_EXAMPLES[conversationExample].label : entry.sender,
	}))
	return {
		totalEntryCount: allEntries.length,
		entryOffset,
		page: { entries, nextCursor: null },
		isLoading: variant === "loading",
		hasError: variant === "failed",
		isPending: false,
		pageNumber,
		pageCount,
		confirmation,
		error: null,
		retry: () => {},
		openPage: setRequestedPage,
		removeEntry: setConfirmation,
		cancel: () => setConfirmation(null),
		confirm: async () => {
			if (confirmation) {
				setDeletedIds([...deletedIds, confirmation.id])
			}
			setConfirmation(null)
		},
	}
}

// fictional entries include a permanent import and a long private conversation reference
export const PERSONAL_SOURCES_ENTRIES_STORY: PersonalSourceEntry[] = [
	{
		id: "entry-example",
		linkOutcomes: [
			{
				url: "https://example.com/research",
				status: "finding",
				findingId: "finding-example",
				href: "/topics/topic-example?finding=finding-example",
			},
			{ url: "https://hamel.dev/", title: "A practical guide to evaluating language models", status: "scored" },
			{ url: "https://github.com/", status: "queued" },
		],
		sourceId: "agent-example",
		topicId: "topic-example",
		origin: "import",
		title: "A deliberately selected conversation about small language models and research habits",
		text: "Reader: Compare local inference with hosted models.\n\nAssistant: Keep evaluation latency, energy use, and source quality separate.\n\nThis text belongs only to this personal Topic.",
		sender: "Claude import",
		senderKind: "import",
		links: ["https://example.com/research", "https://hamel.dev/", "https://github.com/"],
		chatUrl: "https://claude.ai/chat/fictional-private-reference",
		receivedAt: "2026-11-02T12:30:00Z",
		expiresAt: null,
		summarizedAt: null,
		omittedLinkCount: 2,
	},
]
// seven distinct items exercise the five-row first page and the final two rows
const PAGED_ENTRIES = PERSONAL_SOURCES_ENTRIES_STORY.flatMap((entry) =>
	Array.from({ length: 7 }, (_, index) => ({
		...entry,
		id: `paged-entry-${index + 1}`,
		title: `Research note ${index + 1}: local inference and source quality`,
	})),
)
export const PERSONAL_SOURCES_SOURCE_STORY: PersonalSource = {
	id: "agent-example",
	sourceKind: "ai_agent",
	label: "Claude import",
	weekEntryCount: 3,
	entryCount: 23,
	isConnected: true,
	waitingLinkCount: 2,
}
export const TOPIC_PERSONAL_SOURCES_STORY: TopicPersonalSources = {
	sources: [PERSONAL_SOURCES_SOURCE_STORY],
	sourceCount: 4,
	canReceive: true,
	context: { status: "ready", hasIncompleteCoverage: false, activatedAt: "2026-11-02T12:30:00Z" },
}

/**
 * Supplies local Source deletion and failure states without an API request.
 */
export function usePersonalSourceStory(
	variant: "ready" | "empty" | "loading" | "failed" | "confirmation" = "ready",
): PersonalSourceState {
	const [confirmation, setConfirmation] = useState<PersonalSourceState["confirmation"]>(
		variant === "confirmation" ? { title: PERSONAL_SOURCES_SOURCE_STORY.label } : null,
	)
	return {
		error: variant === "failed" ? "Could not delete that content. Refresh and try again." : null,
		confirmation,
		removeSource: () => setConfirmation({ title: PERSONAL_SOURCES_SOURCE_STORY.label }),
		cancel: () => setConfirmation(null),
		confirm: async () => setConfirmation(null),
	}
}

// one authorized Finding supports the same inline-link stories on both platforms
export const PERSONAL_SOURCES_TOPIC_STORY = toTestTopicResponse({
	id: "topic-example",
	name: "LLM evals",
	findings: [
		toTestTopicFinding({
			findingId: "finding-example",
			title: "Local inference and source quality",
			url: "https://example.com/research",
			relevanceExplanation: "A practical evaluation method for the models this Topic follows.",
		}),
	],
})

// each link state uses the same page and authorized Finding in both component browsers
export const PERSONAL_SOURCE_LINK_OUTCOMES = {
	finding: {
		url: "https://example.com/research",
		status: "finding",
		findingId: "finding-example",
		href: "/topics/topic-example?finding=finding-example",
	},
	queued: { url: "https://example.com/research", status: "queued" },
	scored: { url: "https://example.com/research", status: "scored" },
	rejected: { url: "https://example.com/research", status: "not_scored", reason: "No text to score" },
} satisfies Record<string, PersonalSourceLinkOutcome>
