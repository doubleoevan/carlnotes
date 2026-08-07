import { MAX_TOPIC_SOURCES, type TopicResponse } from "@shared/contracts"
import { editableSourceKinds } from "@shared/enums"
import { Lightbulb, X } from "lucide-react"
import type * as React from "react"
import { useState } from "react"
import { toast } from "sonner"
import { randomThinkingLine } from "@/components/chat/thinkingLines"
import { Badge } from "@/components/primitives/badge"
import { Button } from "@/components/primitives/button"
import { Input } from "@/components/primitives/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/primitives/select"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import { fetchSourceSuggestions } from "@/lib/topicClient"
import { cn, WEB_SOURCE } from "@/lib/utils"
import { toScreeningNote } from "./TopicInfo"

// the source kinds that the custom source picker offers, one of the editable source kinds
export type EditableSourceKind = (typeof editableSourceKinds)[number]

// the source kinds that the custom source picker offers. the search kind is the default web search, managed by its own toggle
const CUSTOM_SOURCE_KINDS = editableSourceKinds.filter((kind) => kind !== "search")

// how many sources one suggestion request asks for at most
const MAX_SUGGESTIONS = 3

// what the source controls say once the topic has reached its source limit
export const FULL_SOURCES_NOTE = `Carl reads ${MAX_TOPIC_SOURCES} sources per topic. Drop one to add another.`

// the placeholder for the source picker's value input, per pickable source kind
const SOURCE_VALUE_PLACEHOLDER: Record<EditableSourceKind, string> = {
	url: "page url…",
	rss: "feed url…",
	reddit: "subreddit…",
	youtube: "channel or playlist id…",
	search: "",
}

// the source editor props: the kept stored sources, the pending new ones, and their change callbacks.
// the topic's own words and its prompt urls come along too, since suggesting reads the first and the cap counts the second
type TopicSourceEditorProps = {
	keptSources: TopicResponse["sources"]
	addedSources: { sourceKind: EditableSourceKind; value: string }[]
	topicName: string
	topicPrompt: string
	topicAttachmentContext: string
	promptSourceUrls: string[]
	onKeptChange: (sources: TopicResponse["sources"]) => void
	onAddedChange: (sources: { sourceKind: EditableSourceKind; value: string }[]) => void
}

/**
 * The sources editor: the default web search toggle, then the custom rows with ✕ and the source kind/value add picker
 */
export function TopicSourceEditor({
	keptSources,
	addedSources,
	topicName,
	topicPrompt,
	topicAttachmentContext,
	promptSourceUrls,
	onKeptChange,
	onAddedChange,
}: TopicSourceEditorProps) {
	// the add-source picker's open state with its pending kind and value
	const [isAdding, setIsAdding] = useState(false)
	const [newKind, setNewKind] = useState<EditableSourceKind>("rss")
	const [newValue, setNewValue] = useState("")
	// the suggest sources request in flight, which replaces the Recommend button with a thinking line while it runs
	const [isSuggestingSources, setIsSuggestingSources] = useState(false)

	// split the default web search from the custom sources
	const hasWebSource = [...keptSources, ...addedSources].some((source) => source.sourceKind === "search")
	const keptCustomSources = keptSources.filter((source) => source.sourceKind !== "search")
	const addedCustomSources = addedSources.filter((source) => source.sourceKind !== "search")
	// a topic needs somewhere to look, so the last remaining source cannot be removed.
	// urls written into the prompt become sources on save, so they take a sources slot the same as any other
	const totalSources =
		(hasWebSource ? 1 : 0) + keptCustomSources.length + addedCustomSources.length + promptSourceUrls.length
	const sourceSlotsLeft = MAX_TOPIC_SOURCES - totalSources
	const isFull = sourceSlotsLeft <= 0

	// suggesting a source reads the topic's own words, so a topic that describes nothing yet has nothing to read
	const hasTopicWords = Boolean(topicName.trim() || topicPrompt.trim())

	// ask for what the topic can hold, and tell the api everything it already follows so nothing repeats
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
				toast("Carl came up empty.\n Try saying more about your topic.")
				return
			}
			onAddedChange([...addedSources, ...suggestions])
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

	// the web search source turns on by staging a configless search source, and off by dropping every search row
	const handleSearchSourceOn = (): void => {
		onAddedChange([...addedSources, { sourceKind: "search", value: "" }])
	}
	const handleSearchSourceOff = (): void =>
		removeSource(() => {
			onKeptChange(keptCustomSources)
			onAddedChange(addedCustomSources)
		})

	// stage the picked source and reset the picker, skipping an exact duplicate
	const handleAddSource = (): void => {
		const value = newValue.trim()
		const isDuplicateSource = addedSources.some((added) => added.sourceKind === newKind && added.value === value)
		if (value && !isDuplicateSource) {
			onAddedChange([...addedSources, { sourceKind: newKind, value }])
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
			{/* default sources: web search, on or off */}
			<TopicSourceSectionLabel>default sources</TopicSourceSectionLabel>
			{hasWebSource ? (
				<TopicSource sourceKind={WEB_SOURCE.label} summary={WEB_SOURCE.summary} onRemove={handleSearchSourceOff} />
			) : (
				<button type="button" onClick={handleSearchSourceOn} className="text-link text-sm hover:underline">
					+ web search
				</button>
			)}

			{/* custom sources: one row per source with the source kind pill, its config text, and ✕ to remove it */}
			<TopicSourceSectionLabel className="mt-2.5">custom sources</TopicSourceSectionLabel>
			<div className="space-y-1.5">
				{keptCustomSources.map((source) => (
					<TopicSource
						key={source.id}
						sourceKind={source.sourceKind}
						summary={source.summary}
						screening={toScreeningNote(source)}
						onRemove={() => removeSource(() => onKeptChange(keptSources.filter((kept) => kept.id !== source.id)))}
					/>
				))}
				{addedCustomSources.map((source) => (
					<TopicSource
						key={`${source.sourceKind}-${source.value}`}
						sourceKind={source.sourceKind}
						summary={source.value}
						onRemove={() => removeSource(() => onAddedChange(addedSources.filter((added) => added !== source)))}
					/>
				))}
			</div>
			{/* the add source picker: a kind select, the value input, Add, and ✕ to cancel without staging anything */}
			{isAdding ? (
				<div className="mt-2 flex items-center gap-2">
					<Select value={newKind} onValueChange={(value) => setNewKind(value as EditableSourceKind)}>
						<SelectTrigger className="w-28 shrink-0">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{CUSTOM_SOURCE_KINDS.map((kind) => (
								<SelectItem key={kind} value={kind}>
									{kind}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					<Input
						autoFocus
						placeholder={SOURCE_VALUE_PLACEHOLDER[newKind]}
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

// everything the topic already follows, in the shape the api compares by. a kept source is named by its summary,
// which is the feed's host or the subreddit or the id, and that is what identity is decided on
function toExcludedSources(
	keptSources: TopicResponse["sources"],
	addedSources: { sourceKind: EditableSourceKind; value: string }[],
	promptSourceUrls: string[],
): { sourceKind: EditableSourceKind; value: string }[] {
	return [
		...keptSources.map((source) => ({ sourceKind: source.sourceKind as EditableSourceKind, value: source.summary })),
		...addedSources,
		...promptSourceUrls.map((url) => ({ sourceKind: "url" as const, value: url })),
	]
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

// the button that asks Carl to suggest sources. its tooltip shows how many sources it can be added
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

// a tiny source section label inside the sources field
function TopicSourceSectionLabel({ children, className }: { children: React.ReactNode; className?: string }) {
	return <div className={cn("text-muted-foreground/80 mb-1 text-[11px] tracking-wide", className)}>{children}</div>
}

// one source row in the editor: the source kind pill, the config text, it's llm-guard screening status, and the ✕ remove control
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
