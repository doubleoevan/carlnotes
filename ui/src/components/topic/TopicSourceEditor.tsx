import { MAX_TOPIC_SOURCES, type SuggestSourcesPayload, type TopicResponse } from "@shared/contracts"
import {
	CUSTOM_SOURCE_OPTIONS,
	type CustomSourceKey,
	DEFAULT_SOURCES,
	toCustomSourceOption,
	toSourceSummary,
} from "@shared/sources"
import { Lightbulb, X } from "lucide-react"
import type * as React from "react"
import { useState } from "react"
import { toast } from "sonner"
import { fetchSourceSuggestions } from "@/clients/topicClient"
import { randomThinkingLine } from "@/components/chat/thinkingLines"
import { Badge } from "@/components/primitives/badge"
import { Button } from "@/components/primitives/button"
import { Input } from "@/components/primitives/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/primitives/select"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import { cn } from "@/lib/utils"
import { toScreeningNote } from "./TopicInfo"

// a source staged by the picker or by a suggestion: the custom source option it came from, and its typed value
export type AddedSource = { optionKey: string; value: string; name?: string }

// how many sources one suggestion request asks for at most
const MAX_SUGGESTIONS = 3

// what the add-source buttons say once the topic has reached its source limit
export const FULL_SOURCES_NOTE = `Carl reads ${MAX_TOPIC_SOURCES} sources per topic. Drop one to add another.`

// a staged row reads as its resolved name, then as its config summary, then as what was typed
function toStagedSummary(added: AddedSource): string {
	if (added.name) {
		return added.name
	}
	const option = toCustomSourceOption(added.optionKey)
	const config = option?.toConfig(added.value)
	return (option && config && toSourceSummary(option.sourceKind, config)) || added.value
}

// the source editor props: the default sources switched on by key, the kept stored sources, the pending new ones
type TopicSourceEditorProps = {
	defaultSourceKeys: string[]
	keptSources: TopicResponse["sources"]
	addedSources: AddedSource[]
	topicName: string
	topicPrompt: string
	topicAttachmentContext: string
	promptSourceUrls: string[]
	onDefaultKeysChange: (keys: string[]) => void
	onKeptChange: (sources: TopicResponse["sources"]) => void
	onAddedChange: (sources: AddedSource[]) => void
}

/**
 * The sources editor: a row per default source, then the custom rows with an ✕ to remove, and the source option/value add picker
 */
export function TopicSourceEditor({
	defaultSourceKeys,
	keptSources,
	addedSources,
	topicName,
	topicPrompt,
	topicAttachmentContext,
	promptSourceUrls,
	onDefaultKeysChange,
	onKeptChange,
	onAddedChange,
}: TopicSourceEditorProps) {
	// the add-source picker's open state with its pending option and value
	const [isAdding, setIsAdding] = useState(false)
	const [newOptionKey, setNewOptionKey] = useState("rss")
	const [newValue, setNewValue] = useState("")
	// the suggest sources request in flight, which replaces the Recommend button with a thinking line while it runs
	const [isSuggestingSources, setIsSuggestingSources] = useState(false)

	// the option the picker is on, which names the value input's placeholder
	const newOption = toCustomSourceOption(newOptionKey)
	// a topic needs somewhere to look, so the last remaining source cannot be removed
	const totalSources = defaultSourceKeys.length + keptSources.length + addedSources.length + promptSourceUrls.length
	const sourceSlotsLeft = MAX_TOPIC_SOURCES - totalSources
	const isFull = sourceSlotsLeft <= 0

	// suggesting a source reads the topic's own words, so a topic that describes nothing yet has nothing to read
	const hasTopicWords = Boolean(topicName.trim() || topicPrompt.trim())

	// ask for what the topic can hold, and tell the api everything it already reads so nothing repeats
	const handleSuggestSources = async (): Promise<void> => {
		setIsSuggestingSources(true)
		try {
			const suggestions = await fetchSourceSuggestions({
				name: topicName,
				prompt: topicPrompt,
				attachmentContext: topicAttachmentContext,
				excludeSources: toExcludedSources(keptSources, addedSources, promptSourceUrls),
				limit: Math.min(MAX_SUGGESTIONS, sourceSlotsLeft),
			})
			if (suggestions.length === 0) {
				toast("Carl couldn't think of any.\n Try again in a moment.")
				return
			}

			// a suggestion names the option it is added through, which stages it with its display name
			const suggestedSources = suggestions.map((suggestion) => ({
				optionKey: suggestion.sourceOption,
				value: suggestion.value,
				name: suggestion.name,
			}))
			onAddedChange([...addedSources, ...suggestedSources])
		} catch (error) {
			console.error("source suggestions failed", error)
			toast.error("Carl couldn't think of any.\n Try again in a moment.")
		} finally {
			setIsSuggestingSources(false)
		}
	}

	// remove a source, but show a toast if that would leave the topic with no source at all
	const removeSource = (remove: () => void): void => {
		if (totalSources <= 1) {
			toast.error("Keep at least one source, or Carl's just a guy with opinions.")
			return
		}
		remove()
	}

	// a default source turns on by adding its key and off by dropping it. the save builds its config from the registry
	const handleAddDefaultSource = (key: string): void => onDefaultKeysChange([...defaultSourceKeys, key])
	const handleRemoveDefaultSource = (key: string): void =>
		removeSource(() => onDefaultKeysChange(defaultSourceKeys.filter((defaultKey) => defaultKey !== key)))

	// stage the selected source and reset the picker, skipping an exact duplicate
	const handleAddSource = (): void => {
		const value = newValue.trim()
		const isDuplicateSource = addedSources.some((added) => added.optionKey === newOptionKey && added.value === value)
		if (value && !isDuplicateSource) {
			onAddedChange([...addedSources, { optionKey: newOptionKey, value }])
		}
		setNewValue("")
		setIsAdding(false)
	}

	// back out of the add-source picker without staging anything
	const handleCancelAdd = (): void => {
		setNewValue("")
		setIsAdding(false)
	}

	return (
		<div>
			{/* default sources: one row per default source, on or off */}
			<TopicSourceSectionLabel>default sources</TopicSourceSectionLabel>
			<div className="space-y-1.5">
				{DEFAULT_SOURCES.map((defaultSource) => (
					<TopicDefaultSource
						key={defaultSource.key}
						label={defaultSource.label}
						summary={defaultSource.summary}
						isOn={defaultSourceKeys.includes(defaultSource.key)}
						onTurnOn={() => handleAddDefaultSource(defaultSource.key)}
						onTurnOff={() => handleRemoveDefaultSource(defaultSource.key)}
					/>
				))}
			</div>

			{/* custom sources: one row per source with the source kind pill, its config text, and ✕ to remove it */}
			<TopicSourceSectionLabel className="mt-2.5">custom sources</TopicSourceSectionLabel>
			<div className="space-y-1.5">
				{keptSources.map((source) => (
					<TopicSource
						key={source.id}
						sourceKind={source.sourceKind}
						summary={source.summary}
						screening={toScreeningNote(source)}
						onRemove={() => removeSource(() => onKeptChange(keptSources.filter((kept) => kept.id !== source.id)))}
					/>
				))}
				{addedSources.map((source, sourceIndex) => (
					<TopicSource
						key={`${source.optionKey}-${source.value}`}
						sourceKind={toCustomSourceOption(source.optionKey)?.label ?? source.optionKey}
						summary={toStagedSummary(source)}
						onRemove={() =>
							removeSource(() => onAddedChange(addedSources.filter((_, addedIndex) => addedIndex !== sourceIndex)))
						}
					/>
				))}
			</div>
			{/* the add source picker: a source type select, the value input, Add, and ✕ to cancel without staging anything */}
			{isAdding ? (
				<div className="mt-2 flex items-center gap-2">
					<Select value={newOptionKey} onValueChange={setNewOptionKey}>
						<SelectTrigger className="w-32 shrink-0">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{CUSTOM_SOURCE_OPTIONS.map((option) => (
								<SelectItem key={option.key} value={option.key}>
									{option.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					<Input
						autoFocus
						placeholder={newOption?.placeholder}
						value={newValue}
						onChange={(event) => setNewValue(event.target.value)}
						onKeyDown={(event) => event.key === "Enter" && handleAddSource()}
					/>
					<Button variant="outline" onClick={handleAddSource}>
						Add
					</Button>
					<button
						type="button"
						aria-label="Cancel adding a source"
						onClick={handleCancelAdd}
						className="text-muted-foreground hover:text-foreground grid size-11 shrink-0 place-items-center sm:size-8"
					>
						<X className="size-3.5" />
					</button>
				</div>
			) : (
				<div className="mt-2 flex items-center justify-between gap-4">
					<AddSourceLink isFull={isFull} onClick={() => setIsAdding(true)} />
					{isSuggestingSources ? (
						<ThinkingLine />
					) : (
						<RecommendButton
							isFull={isFull}
							isDisabled={!hasTopicWords}
							suggestionCount={Math.min(MAX_SUGGESTIONS, sourceSlotsLeft)}
							onClick={handleSuggestSources}
						/>
					)}
				</div>
			)}
		</div>
	)
}

// everything the topic already reads, in the shape the api compares by. a kept source is identified by its value
function toExcludedSources(
	keptSources: TopicResponse["sources"],
	addedSources: AddedSource[],
	promptSourceUrls: string[],
): SuggestSourcesPayload["excludeSources"] {
	// a staged source already names its option, and a stored one names the kind that option saves as
	const storedSources = keptSources.flatMap((source) => {
		const optionKey = toCustomSourceKey(source.sourceKind)
		return optionKey ? [{ sourceOption: optionKey, value: source.value }] : []
	})
	return [
		...storedSources,
		...addedSources.flatMap((added) => toExcludedStagedSource(added)),
		...promptSourceUrls.map((url) => ({ sourceOption: "url" as const, value: url })),
	]
}

// the option key a stored source's kind belongs to, or undefined for a kind the picker cannot add
function toCustomSourceKey(sourceKind: string): CustomSourceKey | undefined {
	return CUSTOM_SOURCE_OPTIONS.find((option) => option.sourceKind === sourceKind)?.key
}

// a staged source in the shape the api compares by, dropped when its option is one the picker no longer offers
function toExcludedStagedSource(added: AddedSource): SuggestSourcesPayload["excludeSources"] {
	const option = toCustomSourceOption(added.optionKey)
	return option ? [{ sourceOption: option.key, value: added.value }] : []
}

// the link that opens the add-source picker
function AddSourceLink({ isFull, onClick }: { isFull: boolean; onClick: () => void }) {
	const link = (
		<button
			type="button"
			onClick={onClick}
			disabled={isFull}
			className="text-link text-sm hover:underline disabled:cursor-default disabled:opacity-50 disabled:hover:no-underline"
		>
			+ add a source
		</button>
	)
	if (!isFull) {
		return link
	}
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<span>{link}</span>
			</TooltipTrigger>
			<TooltipContent>{FULL_SOURCES_NOTE}</TooltipContent>
		</Tooltip>
	)
}

// the button that asks Carl to suggest sources. its tooltip shows how many sources it can add
function RecommendButton({
	isFull,
	isDisabled,
	suggestionCount,
	onClick,
}: {
	isFull: boolean
	isDisabled: boolean
	suggestionCount: number
	onClick: () => void
}) {
	const suggestionNote = `Carl suggests up to ${suggestionCount} source${suggestionCount === 1 ? "" : "s"}`
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<span>
					<Button variant="outline" size="sm" onClick={onClick} disabled={isFull || isDisabled}>
						<Lightbulb className="size-3.5" />
						Recommend
					</Button>
				</span>
			</TooltipTrigger>
			<TooltipContent>{isFull ? FULL_SOURCES_NOTE : suggestionNote}</TooltipContent>
		</Tooltip>
	)
}

// one thinking line, shown where the suggest sources button was while its request is in flight
function ThinkingLine() {
	const [thinkingLine] = useState(randomThinkingLine)
	return <span className="shimmer-text text-sm">{`Carl is ${thinkingLine}…`}</span>
}

// one default source row. it removes like any other source when on, and reads as a + turn-on button when off
function TopicDefaultSource({
	label,
	summary,
	isOn,
	onTurnOn,
	onTurnOff,
}: {
	label: string
	summary: string
	isOn: boolean
	onTurnOn: () => void
	onTurnOff: () => void
}) {
	if (!isOn) {
		return (
			<button type="button" onClick={onTurnOn} className="text-link text-sm hover:underline">
				+ {label}
			</button>
		)
	}
	return <TopicSource sourceKind={label} summary={summary} onRemove={onTurnOff} />
}

// a tiny source section label inside the sources field
function TopicSourceSectionLabel({ children, className }: { children: React.ReactNode; className?: string }) {
	return <div className={cn("text-muted-foreground/80 mb-1 text-[11px] tracking-wide", className)}>{children}</div>
}

// one source row in the editor
function TopicSource({
	sourceKind,
	summary,
	screening,
	onRemove,
}: {
	sourceKind: string
	summary: string
	screening?: string | null
	onRemove: () => void
}) {
	return (
		<div className="flex items-center gap-2 text-sm">
			<Badge variant="outline" className="shrink-0">
				{sourceKind}
			</Badge>
			<span className="text-muted-foreground min-w-0 flex-1 truncate">
				{summary || "—"}
				{screening && <span className="text-muted-foreground/70"> · {screening}</span>}
			</span>
			<Tooltip>
				<TooltipTrigger asChild>
					<button
						type="button"
						aria-label={`Remove ${sourceKind} source`}
						onClick={onRemove}
						className="text-muted-foreground hover:text-foreground shrink-0"
					>
						<X className="size-3.5" />
					</button>
				</TooltipTrigger>
				<TooltipContent>Delete source</TooltipContent>
			</Tooltip>
		</div>
	)
}
