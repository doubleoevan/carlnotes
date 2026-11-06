import { PERSONAL_SOURCES_SEND_TOPIC_LIMIT } from "@carlnotes/contracts/personalSources"
import { type SuggestTopicsPayload, suggestTopicsPayload } from "@carlnotes/contracts/personalSourcesPayloads"
import {
	START_TOPIC_DRAFT_LABEL,
	type SuggestedTopic,
	type TopicSuggestionsResult,
	topicSuggestionsResult,
	toTopicSuggestionsText,
} from "@carlnotes/contracts/topicSuggestions"
import { Plus } from "lucide-react"
import { useId, useRef, useState } from "react"
import { CoffeeLoading } from "@/components/branding/CoffeeLoading"
import { BackButton } from "@/components/common/BackButton"
import { Pagination } from "@/components/common/Pagination"
import { Button } from "@/components/primitives/button"
import { SearchResultRow } from "@/components/search/SearchResultRow"
import { TopicSearchResultDetails } from "@/components/search/TopicSearchResultDetails"
import { TagPill } from "@/components/topic/TagPicker"
import { TopicMcpView } from "./TopicMcpView"
import { TopicSuggestionsSearch } from "./TopicSuggestionsSearch"
import { useTopicSuggestionsMcpView } from "./useTopicSuggestionsMcpView"

// only host-provided tool arguments supply the private send content
export type TopicSuggestionsMcpViewProps = {
	suggestions: TopicSuggestionsResult
	toolArguments: Record<string, unknown> | null
}

/**
 * Shows ranked editable destinations with one explicit multi-Topic send.
 */
export function TopicSuggestionsMcpView({ suggestions, toolArguments }: TopicSuggestionsMcpViewProps) {
	// validate host data before enabling a write from the MCP view
	const parsedSuggestions = topicSuggestionsResult.safeParse(suggestions)
	const parsedInput = suggestTopicsPayload.safeParse(toolArguments)
	if (!parsedSuggestions.success || parsedSuggestions.data.status === "unavailable") {
		return <p role="alert">Topic matching is unavailable. Nothing was saved. Ask your app to try again.</p>
	}
	if (!parsedInput.success) {
		return (
			<div>
				<p role="alert">Reopen the suggestions in your app to enable sending.</p>
				<p className="whitespace-pre-wrap">{toTopicSuggestionsText(parsedSuggestions.data)}</p>
			</div>
		)
	}
	return <TopicPicker suggestions={parsedSuggestions.data} input={parsedInput.data} />
}

// the picker owns one content selection for its lifetime
function TopicPicker({
	suggestions,
	input,
}: {
	suggestions: Extract<TopicSuggestionsResult, { status: "suggested" }>
	input: SuggestTopicsPayload
}) {
	const state = useTopicSuggestionsMcpView({ suggestions, input })
	// preserve the picker's rendered height while its draft fields scroll
	const pickerRef = useRef<HTMLElement>(null)
	const [draftHeight, setDraftHeight] = useState<number | null>(null)
	const selectedCount = state.selectedTopics.size
	const selectedTopics = [...state.selectedTopics]
	if (state.confirmation) {
		return <TopicMcpView mcpViewTopicResult={state.confirmation} editTopicArguments={null} />
	}
	if (state.draft) {
		return (
			<div
				className="mx-auto flex w-full max-w-3xl min-h-0 flex-col gap-3"
				style={draftHeight ? { height: draftHeight } : undefined}
			>
				<BackButton label="Back to topics" className="shrink-0 self-start" onClick={state.closeDraft} />
				<TopicMcpView
					mcpViewTopicResult={state.draft}
					editTopicArguments={null}
					onCreated={state.topicCreated}
					shouldFillHeight
				/>
			</div>
		)
	}
	return (
		<section
			ref={pickerRef}
			aria-label="Choose Topics for this send"
			className="bg-card relative mx-auto w-full max-w-3xl rounded-lg border p-5 sm:p-6"
		>
			<div className="space-y-7">
				{/* the content the reader is choosing destinations for */}
				<header className="space-y-2">
					<h1 className="font-display text-3xl">Where should this go?</h1>
					<p className="text-muted-foreground break-words text-base sm:text-lg">
						{input.title} · {toLinkCountText(input.links.length)}
					</p>
				</header>
				{suggestions.routeTopicId && (
					<p className="text-muted-foreground text-sm">
						This connection can send to its bound topic only. Use the account-wide CarlNotes connection to send to
						several topics.
					</p>
				)}
				{/* search and cursor pages preserve selections made elsewhere */}
				<section aria-label="Your topics" className="space-y-3">
					<div className="flex items-center justify-between gap-3">
						<h2 className="font-semibold">Your topics</h2>
						<span className="text-muted-foreground text-sm" aria-live="polite">
							{selectedCount} selected
						</span>
					</div>
					<TopicSuggestionsSearch
						input={input}
						query={state.query}
						selectedTopics={state.selectedTopics}
						routeTopicId={suggestions.routeTopicId}
						isDisabled={state.isWorking}
						onSelect={state.select}
						onSearch={state.search}
					/>
					{/* retain the middle's layout while only its results show loading */}
					<section className="relative" aria-label="Topic results" aria-busy={state.isWorking}>
						{state.isWorking && (
							<div role="status" className="bg-card absolute inset-0 z-10 flex items-center justify-center">
								<CoffeeLoading className="min-h-0" />
							</div>
						)}
						<div className={state.isWorking ? "invisible space-y-3" : "space-y-3"} inert={state.isWorking}>
							<div>
								{state.page.editableTopics.map((topic) => (
									<EditableTopicRow
										key={topic.id}
										topic={topic}
										isSelected={state.selectedTopics.has(topic.id)}
										isDisabled={
											state.isWorking ||
											isTopicChoiceDisabled({
												topicId: topic.id,
												routeTopicId: suggestions.routeTopicId,
												selectedTopics: state.selectedTopics,
											})
										}
										onSelect={() => state.select(topic)}
									/>
								))}
								{state.page.editableTopics.length === 0 && (
									<p className="text-muted-foreground py-5 text-sm">No editable topics on this page.</p>
								)}
							</div>
							<fieldset disabled={state.isWorking} className="min-w-0">
								<Pagination
									ariaLabel="Topic suggestions pages"
									pageNumber={state.pageIndex + 1}
									pageCount={state.pageCount}
									className="flex pt-0"
									onOpenPage={(pageNumber) => void state.openPage(pageNumber)}
								/>
							</fieldset>
						</div>
					</section>
				</section>
				{/* keep every selected destination visible before the explicit write */}
				<section aria-label="Topics to share this chat with" className="space-y-2 text-sm">
					<p className="text-muted-foreground">Topics to share this chat with</p>
					<ul className="flex flex-wrap gap-1.5" aria-live="polite">
						{selectedTopics.map(([id, name]) => (
							<li key={id} className="min-w-0 max-w-full">
								<TagPill label={name} isDisabled={state.isWorking} onRemove={() => state.select({ id, name })} />
							</li>
						))}
					</ul>
					{selectedCount === 0 && <p className="text-muted-foreground">No topics selected.</p>}
				</section>
				{state.error && (
					<p role="alert" className="text-destructive text-sm">
						{state.error}
					</p>
				)}
				{/* draft generation and sending require separate user actions */}
				<footer className="grid auto-rows-fr gap-3 sm:flex sm:items-stretch sm:justify-between">
					<Button
						variant="outline"
						className="h-auto w-full whitespace-normal sm:w-auto"
						disabled={state.isWorking || selectedCount === 0}
						onClick={() => void state.send()}
					>
						{`Send this chat to ${selectedCount} ${selectedCount === 1 ? "topic" : "topics"}`}
					</Button>
					<Button
						className="h-auto w-full whitespace-normal sm:ml-auto sm:w-auto"
						disabled={
							state.isWorking || Boolean(suggestions.routeTopicId) || selectedCount >= PERSONAL_SOURCES_SEND_TOPIC_LIMIT
						}
						onClick={() => {
							setDraftHeight(pickerRef.current?.getBoundingClientRect().height ?? null)
							void state.startTopic()
						}}
					>
						<Plus />
						{START_TOPIC_DRAFT_LABEL}
					</Button>
				</footer>
			</div>
		</section>
	)
}

// keep the row's complete label inside the checkbox hit target
function EditableTopicRow({
	topic,
	isSelected,
	isDisabled,
	onSelect,
}: {
	topic: SuggestedTopic
	isSelected: boolean
	isDisabled: boolean
	onSelect: () => void
}) {
	const checkboxId = useId()
	return (
		<SearchResultRow
			leading={
				<label htmlFor={checkboxId} className="-m-3.5 -mt-3 grid size-11 shrink-0 place-items-center">
					<input
						id={checkboxId}
						aria-label={topic.name}
						type="checkbox"
						className="size-4 shrink-0 cursor-pointer accent-primary disabled:cursor-default disabled:opacity-60"
						checked={isSelected}
						disabled={isDisabled}
						onChange={onSelect}
					/>
				</label>
			}
			title={
				<label htmlFor={checkboxId} title={topic.name} className="text-foreground cursor-pointer text-sm font-semibold">
					{topic.name}
				</label>
			}
			details={
				<TopicSearchResultDetails
					viewerCount={topic.viewerCount}
					subscriberCount={topic.subscriberCount}
					latestPodcastEpisode={topic.latestPodcastEpisode}
				/>
			}
			action={
				topic.isBestMatch && (
					<span className="bg-secondary text-secondary-foreground shrink-0 rounded-full px-2 py-1 text-xs font-semibold">
						Best match
					</span>
				)
			}
		/>
	)
}

// enforce the bound connection and finite selection before enabling another checkbox
function isTopicChoiceDisabled({
	topicId,
	routeTopicId,
	selectedTopics,
}: {
	topicId: string
	routeTopicId?: string | null
	selectedTopics: Map<string, string>
}): boolean {
	return (
		Boolean(routeTopicId && routeTopicId !== topicId) ||
		(!selectedTopics.has(topicId) && selectedTopics.size >= PERSONAL_SOURCES_SEND_TOPIC_LIMIT)
	)
}

// keep title metadata readable for the single-link case too
function toLinkCountText(count: number): string {
	return `${count} ${count === 1 ? "link" : "links"}`
}
