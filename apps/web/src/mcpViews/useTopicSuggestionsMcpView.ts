// hold only the current page, selected destinations, and the pending host call in MCP view memory
import type { McpViewTopicResult } from "@carlnotes/contracts/mcpViews"
import {
	PERSONAL_SOURCES_SEND_TOPIC_LIMIT,
	type PersonalSourcesSendResult,
	personalSourcesSendResult,
} from "@carlnotes/contracts/personalSources"
import type { SuggestTopicsPayload } from "@carlnotes/contracts/personalSourcesPayloads"
import { toPersonalSourcesSendText } from "@carlnotes/contracts/personalSourcesSendText"
import { createTopicPayload } from "@carlnotes/contracts/topicPayloads"
import {
	type SuggestedTopic,
	type TopicSuggestionsResult,
	topicSuggestionsResult,
} from "@carlnotes/contracts/topicSuggestions"
import { TOPIC_NAME_CHARS } from "@carlnotes/contracts/topics"
import { useEffect, useRef, useState } from "react"
import { replaceMcpViewToolCall } from "./mcpViewHistory"
import { callMcpViewTool, setMcpViewData, useMcpViewData } from "./mcpViewHost"
import { toMcpTopicDraftSources } from "./topicDraftSources"

// selected names stay visible even when search or pagination hides their rows
type ReadySuggestions = Extract<TopicSuggestionsResult, { status: "suggested" }>
type TopicSuggestionsMcpViewState = {
	page: ReadySuggestions
	pageIndex: number
	pageCount: number
	query: string
	selectedTopics: Map<string, string>
	// the running request and what the last request returned
	isWorking: boolean
	error: string | null
	confirmation: PersonalSourcesSendResult | null
	draft: McpViewTopicResult | null
	// the actions that the MCP view offers
	search: (query: string) => Promise<void>
	openPage: (pageNumber: number) => Promise<void>
	select: (topic: Pick<SuggestedTopic, "id" | "name">) => void
	send: () => Promise<void>
	startTopic: () => Promise<void>
	closeDraft: () => void
	topicCreated: (topic: { id: string; name: string }) => Promise<void>
}

/**
 * Keeps selection across cursor pages and sends all checked Topics in one explicit host call.
 */
export function useTopicSuggestionsMcpView({
	suggestions,
	input,
}: {
	suggestions: ReadySuggestions
	input: SuggestTopicsPayload
}): TopicSuggestionsMcpViewState {
	const { topicDraftOptions } = useMcpViewData()
	const isPodcastEnabledByDefault = topicDraftOptions?.isPodcastEnabledByDefault ?? false
	// initialize recommended destinations once. later searches preserve the reader's decisions
	const [page, setPage] = useState(suggestions)
	const [selectedTopics, setSelectedTopics] = useState(
		() =>
			new Map(
				suggestions.editableTopics
					.filter((topic) => topic.isBestMatch && (!suggestions.routeTopicId || suggestions.routeTopicId === topic.id))
					.map((topic) => [topic.id, topic.name]),
			),
	)
	const [cursors, setCursors] = useState<Record<number, string | undefined>>({ 0: input.cursor })
	const [pageIndex, setPageIndex] = useState(0)
	const [query, setQuery] = useState(input.query ?? "")
	const [isWorking, setIsWorking] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [confirmation, setConfirmation] = useState<PersonalSourcesSendResult | null>(null)
	const [draft, setDraft] = useState<McpViewTopicResult | null>(null)
	// keep the request state and the last send attempt across renders
	const requestState = useRef({ isActive: true, isWorking: false })
	const sendAttempt = useRef<{ signature: string; requestId: string } | null>(null)
	useEffect(() => {
		requestState.current.isActive = true
		return () => {
			requestState.current.isActive = false
		}
	}, [])

	// serialize host actions and discard replies after the MCP view is replaced
	const perform = async (action: () => Promise<void>): Promise<void> => {
		if (requestState.current.isWorking || !requestState.current.isActive) {
			return
		}
		requestState.current.isWorking = true
		setIsWorking(true)
		setError(null)
		// run the action and show a retry message if the action throws an error
		try {
			await action()
		} catch {
			if (requestState.current.isActive) {
				setError("The request could not complete. Try again; retrying the same send will not count twice.")
			}
		} finally {
			// end the request and skip the state update after the MCP view is replaced
			requestState.current.isWorking = false
			if (requestState.current.isActive) {
				setIsWorking(false)
			}
		}
	}
	// load the page for a query and a page index
	const loadPage = async ({ nextQuery, nextIndex }: { nextQuery: string; nextIndex: number }): Promise<void> => {
		await perform(async () => {
			// a numbered control uses the server-issued cursor directly, without paying for intervening pages
			const nextCursors = nextQuery === query ? availablePageCursors(cursors, page, pageIndex) : {}
			const loaded = await loadSuggestionPage({
				input: { ...input, query: nextQuery },
				nextIndex,
				cursors: nextCursors,
				isActive: () => requestState.current.isActive,
			})
			if (!requestState.current.isActive) {
				return
			}
			if (!loaded) {
				setError("Matching is unavailable. Your selections are unchanged.")
				return
			}

			// commit the requested page only after every required host call succeeds
			setPage(loaded.page)
			setMcpViewData(loaded.meta)
			setQuery(nextQuery)
			setPageIndex(loaded.index)
			setCursors(loaded.cursors)
		})
	}
	// toggle a Topic, except during a request or on a route bound to another Topic
	const select = (topic: Pick<SuggestedTopic, "id" | "name">): void => {
		if (requestState.current.isWorking || (suggestions.routeTopicId && suggestions.routeTopicId !== topic.id)) {
			return
		}
		setSelectedTopics((previous) => {
			const selected = new Map(previous)
			// remove a selected Topic, or add a new Topic below the send limit
			if (selected.has(topic.id)) {
				selected.delete(topic.id)
			} else if (selected.size < PERSONAL_SOURCES_SEND_TOPIC_LIMIT) {
				selected.set(topic.id, topic.name)
			}
			return selected
		})
	}

	// the id stays stable after a lost response and changes only for a different destination set
	const sendToTopics = async (destinations: Map<string, string>): Promise<void> => {
		if (!destinations.size) {
			return
		}
		await perform(async () => {
			// reuse the request id for the same destinations
			const topicIds = [...destinations.keys()].sort()
			const signature = JSON.stringify(topicIds)
			if (sendAttempt.current?.signature !== signature) {
				sendAttempt.current = { signature, requestId: crypto.randomUUID() }
			}
			const result = await callMcpViewTool("send_to_topic", {
				topic_ids: topicIds,
				title: input.title,
				summary: input.summary,
				links: input.links,
				chat_url: input.chat_url,
				request_id: sendAttempt.current.requestId,
			})
			if (!requestState.current.isActive) {
				return
			}
			// show an error if the result has no send confirmation
			const parsedOutcome = personalSourcesSendResult.safeParse(result.structuredContent)
			if (!parsedOutcome.success) {
				setError("No send confirmation was returned. Retry the same selection to check the outcome.")
				return
			}
			// show the send's own text if the send was not accepted
			const outcome = parsedOutcome.data
			if (result.isError || outcome.status !== "accepted") {
				setError(toPersonalSourcesSendText(outcome))
				return
			}
			// the route keeps the confirmation, so back from its Topic returns to the confirmation and never to a second send
			replaceMcpViewToolCall({ toolResult: result, toolArguments: null })
			setConfirmation(outcome)
		})
	}

	// selecting the new-Topic action alone starts the existing verified-source and confirmation flow
	const startTopic = async (): Promise<void> => {
		if (suggestions.routeTopicId || selectedTopics.size >= PERSONAL_SOURCES_SEND_TOPIC_LIMIT) {
			return
		}
		await perform(async () => {
			// suggest Sources for a Topic named after the title
			const name = input.title.slice(0, TOPIC_NAME_CHARS)
			const sourcesResult = await callMcpViewTool("suggest_sources", { name, prompt: input.summary })
			if (!requestState.current.isActive) {
				return
			}
			// show an error if the Source suggestions are unavailable
			const suggestedSources = sourcesResult.structuredContent as { status?: string; sources?: unknown } | undefined
			if (sourcesResult.isError || suggestedSources?.status !== "ok") {
				setError("Source suggestions are unavailable or today's suggestion limit is used. Nothing was created.")
				return
			}
			const topicDraft = createTopicPayload.parse({
				name,
				prompt: input.summary,
				sources: toMcpTopicDraftSources({
					links: input.links,
					suggestions: suggestedSources.sources,
				}),
				visibility: "private",
				team: null,
				inviteEmails: [],
				isPodcastEnabled: isPodcastEnabledByDefault,
			})
			const preview = await callMcpViewTool("create_topic", topicDraft)
			if (!requestState.current.isActive) {
				return
			}
			// show the Topic Draft, or an error if the preview failed
			const proposedDraft = preview.structuredContent as McpViewTopicResult | undefined
			if (preview.isError || proposedDraft?.status !== "createConfirmRequired") {
				setError("The Topic Draft could not be prepared. Nothing was sent.")
				return
			}
			setDraft(proposedDraft)
		})
	}
	// older or character-limited results expose only the current page and its discovered successor
	const pageCount = page.pageCount ?? pageIndex + 1 + Number(Boolean(page.nextCursor))
	return {
		page,
		pageIndex,
		pageCount,
		query,
		selectedTopics,
		isWorking,
		error,
		confirmation,
		draft,
		select,
		send: () => sendToTopics(selectedTopics),
		startTopic,
		search: (nextQuery) => loadPage({ nextQuery, nextIndex: 0 }),
		openPage: (pageNumber) => {
			const nextIndex = pageNumber - 1
			if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > pageCount || nextIndex === pageIndex) {
				return Promise.resolve()
			}
			return loadPage({ nextQuery: query, nextIndex })
		},
		closeDraft: () => setDraft(null),
		topicCreated: async (topic) => {
			// confirmation sends only to the created destination and preserves it for a safe retry
			const destinations = new Map([[topic.id, topic.name]])
			setSelectedTopics(destinations)
			setDraft(null)
			await sendToTopics(destinations)
		},
	}
}

// the server numbers jump cursors from one; the standard paginator stores zero-based indices
function availablePageCursors(
	previous: Record<number, string | undefined>,
	page: ReadySuggestions,
	pageIndex: number,
): Record<number, string | undefined> {
	const cursors = { ...previous }
	for (const [number, cursor] of Object.entries(page.pageCursors ?? {})) {
		cursors[Number(number) - 1] = cursor
	}
	// add the cursor of the page after the shown page
	if (page.nextCursor) {
		cursors[pageIndex + 1] = page.nextCursor
	}
	return cursors
}

// cached hosts and variable size pages can still traverse the original nextCursor protocol
async function loadSuggestionPage({
	input,
	nextIndex,
	cursors,
	isActive,
}: {
	input: SuggestTopicsPayload
	nextIndex: number
	cursors: Record<number, string | undefined>
	isActive: () => boolean
}): Promise<{
	// the loaded page, its index, the known cursors, and the host's metadata
	page: ReadySuggestions
	index: number
	cursors: Record<number, string | undefined>
	meta?: Record<string, unknown>
} | null> {
	let loadedIndex = Math.max(
		0,
		...Object.keys(cursors)
			.map(Number)
			.filter((index) => index <= nextIndex && cursors[index] !== undefined),
	)
	let loadedPage: ReadySuggestions | null = null
	let meta: Record<string, unknown> | undefined
	for (let index = loadedIndex; index <= nextIndex; index += 1) {
		// read each page from the nearest known cursor up to the requested page
		const result = await callMcpViewTool("suggest_topics", { ...input, cursor: cursors[index] })
		const parsed = topicSuggestionsResult.safeParse(result.structuredContent)
		if (!isActive()) {
			return null
		}
		if (result.isError || !parsed.success || parsed.data.status !== "suggested") {
			return null
		}

		// a shortened catalog ends navigation at its last actual page
		loadedPage = parsed.data
		meta = result._meta
		loadedIndex = index
		cursors[index + 1] = loadedPage.nextCursor ?? undefined
		if (!loadedPage.nextCursor) {
			break
		}
	}
	// return the last page read, or null if no page loaded
	return loadedPage ? { page: loadedPage, index: loadedIndex, cursors, meta } : null
}
