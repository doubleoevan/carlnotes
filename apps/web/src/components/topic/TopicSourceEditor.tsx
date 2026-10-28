import { CUSTOM_SOURCE_OPTIONS, DEFAULT_SOURCES, toCustomSourceOption } from "@carlnotes/contracts/sources"
import { useTopicSourceEditor } from "@carlnotes/core/hooks/useTopicSourceEditor"
import { toScreeningMessage, toStagedTopicSourceSummary } from "@carlnotes/core/lib/topicSources"
import { cn } from "@carlnotes/nightshift/classNames"
import { X } from "lucide-react"
import type * as React from "react"
import { toast } from "sonner"
import { ThinkingLine } from "@/components/common/ThinkingLine"
import { Button } from "@/components/primitives/button"
import { Input } from "@/components/primitives/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/primitives/select"
import { AddSourceLink, RecommendButton } from "./AddSourceButtons"
import { TopicDefaultSource, TopicSource } from "./TopicSource"
import type { TopicFields } from "./useTopicFields"

export type { AddedSource } from "@carlnotes/core/hooks/useTopicFields"

// how many sources one suggestion request asks for at most
const MAX_SUGGESTIONS = 3

// the editor reads and writes the topic being edited, taking its fields whole
type TopicSourceEditorProps = { fields: TopicFields }

/**
 * The sources editor: a row per default source, then the custom rows with an ✕ to remove, and the source option/value add picker
 */
export function TopicSourceEditor({ fields }: TopicSourceEditorProps) {
	const {
		defaultSourceKeys,
		keptSources,
		addedSources,
		setKeptSources,
		setAddedSources,
		isAdding,
		setIsAdding,
		newOptionKey,
		setNewOptionKey,
		newValue,
		setNewValue,
		isSuggestingSources,
		newOption,
		isFull,
		hasTopicWords,
		sourceSlotsLeft,
		handleSuggestSources,
		removeSource,
		handleAddDefaultSource,
		handleRemoveDefaultSource,
		handleAddSource,
		handleCancelAdd,
	} = useTopicSourceEditor(fields, (message) => toast(message))

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
						screeningMessage={toScreeningMessage(source)}
						onRemoveTopicSource={() =>
							removeSource(() => setKeptSources(keptSources.filter((kept) => kept.id !== source.id)))
						}
					/>
				))}
				{addedSources.map((source, sourceIndex) => (
					<TopicSource
						key={`${source.optionKey}-${source.value}`}
						sourceKind={toCustomSourceOption(source.optionKey)?.label ?? source.optionKey}
						summary={toStagedTopicSourceSummary(source)}
						onRemoveTopicSource={() =>
							removeSource(() => setAddedSources(addedSources.filter((_, addedIndex) => addedIndex !== sourceIndex)))
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
						<ThinkingLine className="text-sm" />
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

// a tiny source section label inside the sources field
function TopicSourceSectionLabel({ children, className }: { children: React.ReactNode; className?: string }) {
	return <div className={cn("text-muted-foreground mb-1 text-[11px] tracking-wide", className)}>{children}</div>
}
