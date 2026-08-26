import type { TopicFinding } from "@shared/contracts"
import { Bookmark, Check, Circle, ThumbsDown, ThumbsUp } from "lucide-react"
import type * as React from "react"
import { useState } from "react"
import { sendFindingFeedback } from "@/clients/topicClient"
import { NoteIcon } from "@/components/branding/NoteIcon"
import { UserAvatar } from "@/components/branding/UserAvatar"
import { AnchorLink } from "@/components/common/AnchorLink"
import { Button } from "@/components/primitives/button"
import { Input } from "@/components/primitives/input"
import { Popover, PopoverCloseButton, PopoverContent, PopoverTrigger } from "@/components/primitives/popover"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import { InfoSection } from "@/components/topic/TopicInfo"
import { ScrollBox, toNotesMarkdown } from "@/components/topic/TopicScanRecap"
import { toAgeLabel } from "@/lib/labels"
import { POPOVER_HEADING_CLASS, POPOVER_WIDTH_CLASS } from "@/lib/styleClasses"
import { cn, RESOURCE_KIND_ICON } from "@/lib/utils"
import { type TopicFeedHandlers, useIsSignedIn, useTopicFeedActions } from "@/providers/TopicFeedProvider"

// the row's topic finding, its rank among the topic's auto-kept findings (null when a bookmark pins it
type TopicResourceProps = {
	resource: TopicFinding
	rank: number | null
	isRatable: boolean
	isBookmarkable: boolean
	resourceHandlers?: TopicFeedHandlers
	// names the topic in the note popover's copied Markdown
	topic: { id: string; name: string; prompt: string }
}

/**
 * A single topic resource row. Clicking the row opens the note popup for the topic finding,
 * and clicking the title opens the resource itself in a new tab. Consumed rows appear muted, like an email inbox.
 */
export function TopicResource({
	resource,
	rank,
	isRatable,
	isBookmarkable,
	resourceHandlers,
	topic,
}: TopicResourceProps) {
	// the topic page passes handlers that reload their own payload. the homepage falls back to the shared provider's handlers
	const providerHandlers = useTopicFeedActions()
	const { openTopicFinding, consumeTopicFinding, rateTopicFinding, bookmarkTopicFinding } =
		resourceHandlers ?? providerHandlers
	// signed-out visitors don't get the per-user read and rating buttons
	const isSignedIn = useIsSignedIn()
	const ResourceIcon = RESOURCE_KIND_ICON[resource.resourceKind]
	// the whole row opens the note popup for the topic finding and hovering it shows the hint
	const [isNoteOpen, setIsNoteOpen] = useState(false)
	const handleNoteOpenChange = (isOpen: boolean): void => {
		setIsNoteOpen(isOpen)
	}
	const [isHintOpen, setIsHintOpen] = useState(false)
	// unread rows are bold. consumed rows go muted. the underline is the link's own, so it only appears over the title itself
	const titleClass = cn(
		"text-sm group-hover:text-foreground hover:underline",
		resource.isConsumed ? "text-muted-foreground font-normal" : "text-foreground font-semibold",
	)
	const metadataClass = cn(
		"mt-0.5 text-xs group-hover:text-foreground/80",
		resource.isConsumed ? "text-muted-foreground/70" : "text-muted-foreground",
	)
	// the bookmark mark's label and tooltip, shared so the two never drift apart
	const bookmarkLabel = resource.isBookmarked ? "Remove bookmark" : "Bookmark"
	// the hover highlight paints on a rounded under-layer, so the separator above the row stays straight
	return (
		<Popover open={isNoteOpen} onOpenChange={handleNoteOpenChange}>
			{/* the row is a pointer shortcut to the note popup. only the title link opens the resource, the note button opens this popover */}
			{/* biome-ignore lint/a11y/useKeyWithClickEvents: reachable by keyboard through the link and the note button */}
			{/* biome-ignore lint/a11y/noStaticElementInteractions: a pointer shortcut over children that have the semantics */}
			<div
				onClick={() => handleNoteOpenChange(true)}
				onMouseEnter={() => setIsHintOpen(true)}
				onMouseLeave={() => setIsHintOpen(false)}
				className="group after:border-separator-strong relative isolate flex cursor-pointer before:absolute before:inset-0 before:-z-10 before:rounded-lg before:transition-colors after:absolute after:inset-x-2 after:top-0 after:border-t after:border-dashed first:after:hidden hover:before:bg-accent-foreground/20"
			>
				{/* the rank, in the slot the bookmark mark takes over once the finding is bookmarked */}
				{rank !== null && (
					<span
						className="text-muted-foreground absolute top-1.5 left-0 grid size-11 place-items-center sm:size-8"
						aria-hidden="true"
					>
						<span className="font-display text-sm tabular-nums">{rank}</span>
					</span>
				)}
				{/* the filled bookmark mark, sitting where the rank would be. it only shows on a bookmarked row.
				    it stops the click so removing a bookmark never also opens the note */}
				{isSignedIn && resource.isBookmarked && (
					<Tooltip>
						<TooltipTrigger
							onClick={(event) => {
								event.stopPropagation()
								bookmarkTopicFinding(resource.findingId, false)
							}}
							aria-pressed={true}
							aria-label={bookmarkLabel}
							className="text-primary absolute top-1.5 left-0 grid size-11 place-items-center sm:size-8"
						>
							<Bookmark className="size-3.75 fill-current" strokeWidth={2.5} />
						</TooltipTrigger>
						<TooltipContent>{bookmarkLabel}</TooltipContent>
					</Tooltip>
				)}
				<div
					className={cn(
						// the left padding clears the rank slot
						"flex min-w-0 flex-1 items-start gap-2.5 py-3 pl-9",
						// the right padding clears the note popover, with extra room on an unbookmarked signed-in row
						isSignedIn && !resource.isBookmarked ? "pr-20 sm:pr-16" : "pr-10",
					)}
				>
					<ResourceIcon
						className={cn(
							"mt-0.5 size-4 shrink-0 text-muted-foreground group-hover:text-foreground",
							resource.isConsumed && "opacity-60",
						)}
						aria-label={resource.resourceKind}
					/>
					<div className="min-w-0 flex-1">
						{/* the title is the only part that opens the resource. the truncation lives on the wrapper
						    so the link stays inline and its hover underline covers only the text */}
						<div className="truncate">
							<AnchorLink
								href={resource.url}
								onClick={(event) => {
									event.stopPropagation()
									openTopicFinding(resource.findingId)
								}}
								className={titleClass}
							>
								{resource.title ?? resource.url}
							</AnchorLink>
						</div>
						<div className={cn(metadataClass, "flex items-center gap-1.5")}>
							{[resource.source, toAgeLabel(resource.publishedAt)].filter(Boolean).join(" · ")}
							{/* the teammates who kept this finding */}
							{resource.teamBookmarks.length > 0 && (
								<span className="flex items-center gap-0.5">
									{resource.teamBookmarks.map((saver) => (
										<Tooltip key={saver.userId}>
											<TooltipTrigger asChild>
												<span>
													<UserAvatar
														userId={saver.userId}
														username={saver.username}
														avatarSource={saver.avatarSource}
														className="size-4"
													/>
												</span>
											</TooltipTrigger>
											<TooltipContent>{`${saver.username} kept this`}</TooltipContent>
										</Tooltip>
									))}
								</span>
							)}
						</div>
					</div>
				</div>
				{/* the note button, which anchors the popover and opens it on its own for a keyboard user */}
				<ResourceInfo
					resource={resource}
					topic={topic}
					isRatable={isRatable}
					isBookmarkable={isBookmarkable}
					isSignedIn={isSignedIn}
					isHintOpen={isHintOpen && !isNoteOpen}
					onHintChange={setIsHintOpen}
					onConsume={consumeTopicFinding}
					onRate={rateTopicFinding}
					onBookmark={bookmarkTopicFinding}
				/>
			</div>
		</Popover>
	)
}

// the resource info popover
function ResourceInfo({
	resource,
	topic,
	isRatable,
	isBookmarkable,
	isSignedIn,
	isHintOpen,
	onHintChange,
	onConsume,
	onRate,
	onBookmark,
}: {
	topic: TopicResourceProps["topic"]
	resource: TopicFinding
	isRatable: boolean
	isBookmarkable: boolean
	isSignedIn: boolean
	// the entire row opens the tooltip, so hovering anywhere on it hints at the note this button opens
	isHintOpen: boolean
	onHintChange: (isOpen: boolean) => void
	onConsume: TopicFeedHandlers["consumeTopicFinding"]
	onRate: TopicFeedHandlers["rateTopicFinding"]
	onBookmark: TopicFeedHandlers["bookmarkTopicFinding"]
}) {
	// the bookmark button's label, flipping with the finding's bookmark state
	const bookmarkLabel = resource.isBookmarked ? "Remove bookmark" : "Bookmark"
	// only a topic's owner bookmarks its findings, and an existing bookmark stays removable
	const isBookmarkShown = isBookmarkable || resource.isBookmarked
	// the row owns the popover's open state, so this holds only the trigger the note anchors to and the content
	return (
		<>
			<Tooltip open={isHintOpen} onOpenChange={onHintChange}>
				<TooltipTrigger asChild>
					<PopoverTrigger
						onClick={(event) => event.stopPropagation()}
						className="hover:opacity-75 absolute top-1.5 right-1 grid size-11 place-items-center sm:size-8"
						aria-label="Notes and feedback"
					>
						<NoteIcon />
					</PopoverTrigger>
				</TooltipTrigger>
				<TooltipContent side="top">A topic finding note from Carl</TooltipContent>
			</Tooltip>
			{/* the content renders through a portal, but a react event bubbles the react tree instead of the dom one,
			    so the click is stopped here instead of reaching the row */}
			<PopoverContent onClick={(event) => event.stopPropagation()} align="end" className={POPOVER_WIDTH_CLASS}>
				<PopoverCloseButton />
				<h2 className={POPOVER_HEADING_CLASS}>Topic Finding</h2>

				{/* the AI explanation of why this resource is relevant, in a scroll box so a long note stays contained */}
				<div className="text-muted-foreground font-display mb-1 text-xs tracking-wide uppercase">{"Carl's notes"}</div>
				<ScrollBox
					copyMarkdown={toNotesMarkdown({
						topicId: topic.id,
						topicName: topic.name,
						prompt: topic.prompt,
						note: `[${resource.title ?? resource.url}](${resource.url})\n\n${resource.relevanceExplanation}`,
					})}
				>
					<p>{resource.relevanceExplanation || "No notes yet."}</p>
				</ScrollBox>
				{/* when the resource was fetched and how many times it was opened */}
				<div className="mt-3 space-y-2">
					<InfoSection className="py-0" label="Fetched">
						{new Date(resource.fetchedAt).toLocaleDateString()}
					</InfoSection>
					<InfoSection className="py-0" label="Views">
						{resource.viewCount.toLocaleString()}
					</InfoSection>
				</div>
				{/* the bookmark, read, and rating buttons, only shown to a signed-in user */}
				{isSignedIn && (
					<div className="mt-3 border-t pt-2">
						{/* the bookmark and read toggles share one row, and a user who cannot bookmark gets the read toggle alone */}
						<div className="flex items-center justify-between gap-2">
							{isBookmarkShown && (
								<button
									type="button"
									onClick={() => onBookmark(resource.findingId, !resource.isBookmarked)}
									aria-pressed={resource.isBookmarked}
									className="hover:bg-accent flex min-h-11 items-center gap-2 rounded-md px-2 text-sm sm:min-h-9"
								>
									<Bookmark className={cn("size-4", resource.isBookmarked && "text-primary fill-current")} />
									{bookmarkLabel}
								</button>
							)}
							<button
								type="button"
								onClick={() => onConsume(resource.findingId, !resource.isConsumed)}
								className="hover:bg-accent flex min-h-11 items-center gap-2 rounded-md px-2 text-sm sm:min-h-9"
							>
								{resource.isConsumed ? <Circle className="size-4" /> : <Check className="size-4" />}
								{resource.isConsumed ? "Mark unread" : "Mark read"}
							</button>
						</div>
						{/* the rating row, shown only on topics this user owns or subscribes to */}
						{isRatable && (
							<div className="mt-2 flex min-h-11 items-center justify-between border-t px-2 pt-2 sm:min-h-9">
								<span className="text-muted-foreground text-xs">Rate this finding</span>
								<div className="flex gap-1">
									<ThumbButton
										isActive={resource.rating === "up"}
										label="Thumbs up"
										onClick={() => onRate(resource.findingId, resource.rating === "up" ? null : "up")}
									>
										<ThumbsUp className="size-4" />
									</ThumbButton>
									<ThumbButton
										isActive={resource.rating === "down"}
										label="Thumbs down"
										onClick={() => onRate(resource.findingId, resource.rating === "down" ? null : "down")}
									>
										<ThumbsDown className="size-4" />
									</ThumbButton>
								</div>
							</div>
						)}
						{/* freeform words about the finding. stored as written and never fed to scoring */}
						{isRatable && <FindingFeedbackField findingId={resource.findingId} />}
					</div>
				)}
			</PopoverContent>
		</>
	)
}

// a thumbs up or down toggle for the rating row
type ThumbButtonProps = { isActive: boolean; label: string; onClick: () => void; children: React.ReactNode }
// the freeform words input in the note popover. sent once, then confirmed in place
function FindingFeedbackField({ findingId }: { findingId: string }) {
	const [feedback, setFeedback] = useState("")
	const [isSent, setIsSent] = useState(false)
	const [isSending, setIsSending] = useState(false)

	// send the words as written, then say so where the input was
	const handleSend = async (): Promise<void> => {
		if (!feedback.trim() || isSending) {
			return
		}
		setIsSending(true)
		try {
			await sendFindingFeedback(findingId, feedback.trim())
			setIsSent(true)
		} catch (error) {
			// the words stay in the input, so a failed send can be retried
			console.error("finding feedback send failed", error)
		} finally {
			setIsSending(false)
		}
	}

	// one line of thanks replaces the input once sent
	if (isSent) {
		return <p className="text-muted-foreground mt-2 border-t px-2 pt-2 text-xs">Noted. Carl reads these later.</p>
	}
	return (
		<div className="mt-2 flex items-center gap-2 border-t px-2 pt-2">
			<Input
				aria-label="Feedback for Carl"
				placeholder="Tell Carl why this finding was good or bad…"
				value={feedback}
				onChange={(event) => setFeedback(event.target.value)}
				onKeyDown={(event) => event.key === "Enter" && void handleSend()}
				className="h-8 text-xs"
			/>
			<Button size="sm" onClick={() => void handleSend()} className="h-8 shrink-0 px-3 text-xs">
				Send
			</Button>
		</div>
	)
}

function ThumbButton({ isActive, label, onClick, children }: ThumbButtonProps) {
	return (
		<Button
			type="button"
			variant={isActive ? "default" : "outline"}
			size="icon"
			aria-label={label}
			aria-pressed={isActive}
			onClick={onClick}
			className="size-11 sm:size-9"
		>
			{children}
		</Button>
	)
}
