import { PERSONAL_SOURCES_SEND_TOPIC_LIMIT } from "@carlnotes/contracts/personalSources"
import type { SuggestTopicsPayload } from "@carlnotes/contracts/personalSourcesPayloads"
import type { SuggestedTopic } from "@carlnotes/contracts/topicSuggestions"
import { type KeyboardEvent, useId, useState } from "react"
import { CoffeeLoading } from "@/components/branding/CoffeeLoading"
import { Input } from "@/components/primitives/input"
import { SearchRowOption } from "@/components/search/SearchResultOptions"
import { useTopicAutocomplete } from "./useTopicAutocomplete"

// autocomplete adds a destination while submitting the query filters the paged list
export type TopicSuggestionsSearchProps = {
	input: SuggestTopicsPayload
	query: string
	selectedTopics: Map<string, string>
	routeTopicId?: string | null
	isDisabled: boolean
	onSelect: (topic: Pick<SuggestedTopic, "id" | "name">) => void
	onSearch: (query: string) => Promise<void>
}

/**
 * Filters editable Topics and adds autocomplete choices to the current selection.
 */
export function TopicSuggestionsSearch({
	input,
	query,
	selectedTopics,
	routeTopicId,
	isDisabled,
	onSelect,
	onSearch,
}: TopicSuggestionsSearchProps) {
	// keep typed text separate from the submitted result filter
	const [searchText, setSearchText] = useState(query)
	const [isFocused, setIsFocused] = useState(false)
	const [suggestionIndex, setSuggestionIndex] = useState(-1)
	const listId = useId()
	const autocomplete = useTopicAutocomplete({ input, query: searchText, isEnabled: isFocused && !isDisabled })
	const topics = autocomplete.topics.filter(
		(topic) => !selectedTopics.has(topic.id) && (!routeTopicId || topic.id === routeTopicId),
	)
	const isExpanded = isFocused && !isDisabled && Boolean(searchText.trim())

	// select without navigation or storing the chat, then restore the unfiltered list
	const handleSelect = (topic: SuggestedTopic): void => {
		onSelect(topic)
		setSearchText("")
		setIsFocused(false)
		setSuggestionIndex(-1)
		if (query) {
			void onSearch("")
		}
	}

	// arrows highlight an option. enter selects it or submits the name filter
	const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
		if (event.key === "Escape") {
			setIsFocused(false)
			setSuggestionIndex(-1)
			return
		}
		if (isExpanded && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
			event.preventDefault()
			const step = event.key === "ArrowDown" ? 1 : -1
			setSuggestionIndex((index) => Math.max(-1, Math.min(topics.length - 1, index + step)))
			return
		}
		const topic = topics[suggestionIndex]
		if (event.key === "Enter" && isExpanded && topic && selectedTopics.size < PERSONAL_SOURCES_SEND_TOPIC_LIMIT) {
			event.preventDefault()
			handleSelect(topic)
		}
	}
	return (
		<search className="relative">
			{/* submitting filters results without discarding the selected Topics */}
			<form
				onSubmit={(event) => {
					event.preventDefault()
					setIsFocused(false)
					setSuggestionIndex(-1)
					void onSearch(searchText)
				}}
			>
				<Input
					role="combobox"
					aria-label="Search your topics"
					aria-autocomplete="list"
					aria-expanded={isExpanded}
					aria-controls={isExpanded ? listId : undefined}
					aria-activedescendant={isExpanded && topics[suggestionIndex] ? `${listId}-${suggestionIndex}` : undefined}
					placeholder="Search your topics"
					type="search"
					enterKeyHint="search"
					autoComplete="off"
					className="h-14 bg-transparent px-5 text-base shadow-none md:text-base"
					maxLength={200}
					value={searchText}
					disabled={isDisabled}
					onFocus={() => setIsFocused(true)}
					onBlur={() => setIsFocused(false)}
					onKeyDown={handleKeyDown}
					onChange={(event) => {
						setSearchText(event.target.value)
						setIsFocused(true)
						setSuggestionIndex(-1)
					}}
				/>
			</form>
			{/* reuse the site's typeahead rows for in-place selection */}
			{isExpanded && (
				<div
					id={listId}
					role="listbox"
					aria-label="Matching topics"
					onMouseDown={(event) => event.preventDefault()}
					className="bg-popover text-popover-foreground absolute top-full right-0 left-0 z-30 mt-1 overflow-hidden rounded-md border p-1 shadow-raised"
				>
					{topics.map((topic, index) => (
						<SearchRowOption
							key={topic.id}
							suggestionId={`${listId}-${index}`}
							searchRow={{
								kind: "topic",
								...topic,
								path: topic.url,
								date: null,
								count: null,

								subscriberCount: topic.subscriberCount ?? 0,
								topic: { id: topic.id, name: topic.name, latestPodcastEpisode: topic.latestPodcastEpisode ?? null },
								isSubscribed: null,
							}}
							isActive={index === suggestionIndex}
							isDisabled={selectedTopics.size >= PERSONAL_SOURCES_SEND_TOPIC_LIMIT}
							onOpen={() => setIsFocused(false)}
							onSelect={() => handleSelect(topic)}
						/>
					))}
					{autocomplete.isLoading && <CoffeeLoading className="min-h-0 py-3 text-sm" />}
					{!autocomplete.isLoading && topics.length === 0 && (
						<p className="text-muted-foreground px-2 py-2 text-sm">
							No unselected topics match. Press Enter to filter your topics.
						</p>
					)}
				</div>
			)}
		</search>
	)
}
