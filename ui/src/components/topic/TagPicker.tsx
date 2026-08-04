import { Plus, Search, X } from "lucide-react"
import type * as React from "react"
import { useState } from "react"
import { Badge } from "@/components/primitives/badge"
import { Input } from "@/components/primitives/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/primitives/popover"

// canCreate lets typing add a tag that is not in knownTags, and openPickerLabel renders a link that opens the picker
type TagPickerProps = {
	tags: string[]
	knownTags: string[]
	canCreate?: boolean
	openPickerLabel?: string
	onTagsChange: (tags: string[]) => void
}

/**
 * The shared tag widget: pills with an "✕" to remove, and a "+" button that opens a github-style picker to search and add tags.
 * With canCreate, typing an unknown tag offers a Create row. Without it, the picker only filters known tags.
 * A label renders before the pills as a link-styled trigger opening the same picker.
 */
export function TagPicker({ tags, knownTags, canCreate = false, openPickerLabel, onTagsChange }: TagPickerProps) {
	const [isOpen, setIsOpen] = useState(false)
	const [tagQuery, setTagQuery] = useState("")

	// the suggested tags are the known ones not already selected, narrowed by the tag search text
	const tagSearch = tagQuery.trim().toLowerCase()
	const suggestedTags = knownTags.filter((tag) => !tags.includes(tag) && tag.toLowerCase().includes(tagSearch))

	// offer to create a new tag when allowed, unknown, and not already selected
	const newTag = tagQuery.trim()
	const isKnown = [...knownTags, ...tags].some((tag) => tag.toLowerCase() === newTag.toLowerCase())
	const canCreateTyped = canCreate && newTag !== "" && !isKnown

	// add a tag and clear the search. the picker stays open so that several tags can be added in a row
	const handleAddTag = (tag: string): void => {
		if (!tags.includes(tag)) {
			onTagsChange([...tags, tag])
		}
		setTagQuery("")
	}

	// enter creates the new tag if allowed, or takes the top suggested tag
	const handleInputKeyDown = (event: React.KeyboardEvent): void => {
		if (event.key !== "Enter") {
			return
		}
		event.preventDefault()
		if (canCreateTyped) {
			handleAddTag(newTag)
		} else if (suggestedTags[0]) {
			handleAddTag(suggestedTags[0])
		}
	}

	return (
		<div className="flex flex-wrap items-center gap-1.5">
			<Popover open={isOpen} onOpenChange={setIsOpen}>
				{/* the optional link-styled label anchors and opens the picker */}
				{openPickerLabel && (
					<PopoverTrigger asChild>
						<button type="button" className="text-link text-sm hover:underline">
							{openPickerLabel}
						</button>
					</PopoverTrigger>
				)}
				{tags.map((tag) => (
					<TagPill key={tag} label={tag} onRemove={() => onTagsChange(tags.filter((kept) => kept !== tag))} />
				))}
				{/* the "+" button also opens the picker */}
				{openPickerLabel ? (
					<button
						type="button"
						aria-label="Add tag"
						aria-haspopup="dialog"
						aria-expanded={isOpen}
						onClick={() => setIsOpen(!isOpen)}
						className="bg-card text-muted-foreground hover:text-foreground grid size-7 shrink-0 place-items-center rounded-full border shadow-raise"
					>
						<Plus className="size-3.5" />
					</button>
				) : (
					<PopoverTrigger asChild>
						<button
							type="button"
							aria-label="Add tag"
							className="bg-card text-muted-foreground hover:text-foreground grid size-7 shrink-0 place-items-center rounded-full border shadow-raise"
						>
							<Plus className="size-3.5" />
						</button>
					</PopoverTrigger>
				)}
				<PopoverContent align="start" className="w-64 p-2">
					{/* the search box with its magnifying glass icon and clear control */}
					<div className="border-input flex items-center gap-1.5 rounded-md border pl-2">
						<Search className="text-muted-foreground size-3.5 shrink-0" />
						<Input
							autoFocus
							placeholder={canCreate ? "Filter or create tags…" : "Filter tags…"}
							value={tagQuery}
							onChange={(event) => setTagQuery(event.target.value)}
							onKeyDown={handleInputKeyDown}
							className="h-8 flex-1 border-0 bg-transparent px-0 text-sm shadow-none focus-visible:ring-0 dark:bg-transparent"
						/>
						{tagQuery && (
							<button
								type="button"
								onClick={() => setTagQuery("")}
								aria-label="Clear tag search"
								className="text-muted-foreground hover:text-foreground grid size-7 shrink-0 place-items-center"
							>
								<X className="size-3.5" />
							</button>
						)}
					</div>
					<div className="mt-1 max-h-48 overflow-y-auto">
						{suggestedTags.map((tag) => (
							<button
								key={tag}
								type="button"
								onClick={() => handleAddTag(tag)}
								className="hover:bg-accent flex w-full items-center rounded px-2 py-1.5 text-left text-sm"
							>
								{tag}
							</button>
						))}
						{canCreateTyped && (
							<button
								type="button"
								onClick={() => handleAddTag(newTag)}
								className="hover:bg-accent text-link flex w-full items-center rounded px-2 py-1.5 text-left text-sm"
							>
								{`+ Create "${newTag}"`}
							</button>
						)}
						{suggestedTags.length === 0 && !canCreateTyped && (
							<p className="text-muted-foreground px-2 py-1.5 text-sm">
								{canCreate ? "Type to create a tag." : "No matching tags."}
							</p>
						)}
					</div>
				</PopoverContent>
			</Popover>
		</div>
	)
}

/**
 * A tag pill with an "x" remove control
 */
export function TagPill({ label, onRemove }: { label: string; onRemove: () => void }) {
	return (
		<Badge variant="secondary" className="gap-1 py-1 pr-1">
			<span className="max-w-48 truncate">{label}</span>
			<button
				type="button"
				aria-label={`Remove ${label}`}
				onClick={onRemove}
				className="text-muted-foreground hover:text-foreground"
			>
				<X className="size-3" />
			</button>
		</Badge>
	)
}
