import type { TopicResponse } from "@shared/contracts"
import { editableSourceKinds } from "@shared/enums"
import { X } from "lucide-react"
import type * as React from "react"
import { useState } from "react"
import { toast } from "sonner"
import { Badge } from "@/components/primitives/badge"
import { Button } from "@/components/primitives/button"
import { Input } from "@/components/primitives/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/primitives/select"
import { cn, WEB_SOURCE } from "@/lib/utils"

// the source kinds that the custom source picker offers, one of the editable source kinds
export type EditableSourceKind = (typeof editableSourceKinds)[number]

// the source kinds that the custom source picker offers. the search kind is the default web search, managed by its own toggle
const CUSTOM_SOURCE_KINDS = editableSourceKinds.filter((kind) => kind !== "search")

// the placeholder for the source picker's value input, per pickable source kind
const SOURCE_VALUE_PLACEHOLDER: Record<EditableSourceKind, string> = {
	rss: "feed url…",
	reddit: "subreddit…",
	youtube: "channel or playlist id…",
	search: "",
}

// the source editor props: the kept stored sources, the pending new ones, and their change callbacks
type TopicSourceEditorProps = {
	keptSources: TopicResponse["sources"]
	addedSources: { kind: EditableSourceKind; value: string }[]
	onKeptChange: (sources: TopicResponse["sources"]) => void
	onAddedChange: (sources: { kind: EditableSourceKind; value: string }[]) => void
}

/**
 * The sources editor: the default web scout toggle, then the custom rows with ✕ and the source kind/value add picker
 */
export function TopicSourceEditor({ keptSources, addedSources, onKeptChange, onAddedChange }: TopicSourceEditorProps) {
	// the add-source picker's open state with its pending kind and value
	const [isAdding, setIsAdding] = useState(false)
	const [newKind, setNewKind] = useState<EditableSourceKind>("rss")
	const [newValue, setNewValue] = useState("")

	// split the default web search from the custom sources
	const hasWebSource = [...keptSources, ...addedSources].some((source) => source.kind === "search")
	const keptCustomSources = keptSources.filter((source) => source.kind !== "search")
	const addedCustomSources = addedSources.filter((source) => source.kind !== "search")
	// a topic needs somewhere to look, so the last remaining source can't be removed
	const totalSources = (hasWebSource ? 1 : 0) + keptCustomSources.length + addedCustomSources.length

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
		onAddedChange([...addedSources, { kind: "search", value: "" }])
	}
	const handleSearchSourceOff = (): void =>
		removeSource(() => {
			onKeptChange(keptCustomSources)
			onAddedChange(addedCustomSources)
		})

	// stage the picked source and reset the picker, skipping an exact duplicate
	const handleAddSource = (): void => {
		const value = newValue.trim()
		const isDuplicate = addedSources.some((added) => added.kind === newKind && added.value === value)
		if (value && !isDuplicate) {
			onAddedChange([...addedSources, { kind: newKind, value }])
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
				<TopicSource kind={WEB_SOURCE.label} summary={WEB_SOURCE.summary} onRemove={handleSearchSourceOff} />
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
						kind={source.kind}
						summary={source.summary}
						onRemove={() => removeSource(() => onKeptChange(keptSources.filter((kept) => kept.id !== source.id)))}
					/>
				))}
				{addedCustomSources.map((source) => (
					<TopicSource
						key={`${source.kind}-${source.value}`}
						kind={source.kind}
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
				<button type="button" onClick={() => setIsAdding(true)} className="text-link mt-2 text-sm hover:underline">
					+ add a source
				</button>
			)}
		</div>
	)
}

// a tiny source section label inside the sources field
function TopicSourceSectionLabel({ children, className }: { children: React.ReactNode; className?: string }) {
	return <div className={cn("text-muted-foreground/80 mb-1 text-[11px] tracking-wide", className)}>{children}</div>
}

// one source row in the editor: the source kind pill, the config text, and the ✕ remove control
function TopicSource({ kind, summary, onRemove }: { kind: string; summary: string; onRemove: () => void }) {
	return (
		<div className="flex items-center gap-2 text-sm">
			<Badge variant="outline" className="shrink-0">
				{kind}
			</Badge>
			<span className="text-muted-foreground min-w-0 flex-1 truncate">{summary || "—"}</span>
			<button
				type="button"
				aria-label={`Remove ${kind} source`}
				onClick={onRemove}
				className="text-muted-foreground hover:text-foreground shrink-0"
			>
				<X className="size-3.5" />
			</button>
		</div>
	)
}
