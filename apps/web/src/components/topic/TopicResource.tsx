import { authClient, toSessionProfileIdentity } from "@carlnotes/client/authClient"
import type { TopicFinding } from "@carlnotes/contracts/findings"
import type { PodcastEpisode } from "@carlnotes/contracts/podcast"
import { Bookmark } from "lucide-react"
import { useState } from "react"
import { UserAvatar } from "@/components/branding/UserAvatar"
import { TooltipLabel, TooltipSection } from "@/components/common/UpdateCountBadge"
import { FindingChapterPill, useIsFindingChapterPlaying } from "@/components/podcast/PodcastEpisodePill"
import { Popover, PopoverAnchor } from "@/components/primitives/popover"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import { DASHED_ROW_CLASS } from "@/lib/styleClasses"
import { cn } from "@/lib/utils"
import { type TopicFeedHandlers, useIsSignedIn, useTopicFeedActions } from "@/providers/TopicFeedProvider"
import { ResourceInfo, type ResourceInfoTopic } from "./ResourceInfo"
import { TopicFindingSummary } from "./TopicFindingSummary"

// the row's topic finding and its rank among the topic's auto-kept findings, null if a bookmark pins it
type TopicResourceProps = {
	resource: TopicFinding
	rank: number | null
	isRatable: boolean
	isBookmarkable: boolean
	topicFeedHandlers?: TopicFeedHandlers
	// the topic that the note popover's copied Markdown names, with its visibility
	topic: ResourceInfoTopic
	// the topic's latest podcast episode, whose chapters put a pill on the findings that the chapters narrate
	latestPodcastEpisode?: PodcastEpisode | null
	className?: string
}

/**
 * A single topic resource row. Clicking anywhere on the row opens the topic finding's note, which is where the
 * rank, the link out to the page, and Carl's words all live. Consumed rows appear muted, like an email inbox.
 */
export function TopicResource({
	resource,
	rank,
	isRatable,
	isBookmarkable,
	topicFeedHandlers,
	topic,
	latestPodcastEpisode,
	className,
}: TopicResourceProps) {
	// the topic page passes handlers that reload their own payload. the homepage falls back to the shared provider's handlers
	const providerTopicFeedHandlers = useTopicFeedActions()
	const { openTopicFinding, consumeTopicFinding, rateTopicFinding, bookmarkTopicFinding } =
		topicFeedHandlers ?? providerTopicFeedHandlers
	// signed-out visitors don't get the per-user read and rating buttons
	const isSignedIn = useIsSignedIn()
	// whether the chapter that narrates this finding is playing, which keeps the row highlighted
	const isChapterPlaying = useIsFindingChapterPlaying(latestPodcastEpisode, resource.findingId)

	// the whole row opens the note popup for the topic finding and hovering it shows the hint
	const [isNoteOpen, setIsNoteOpen] = useState(false)
	const handleNoteOpenChange = (isOpen: boolean): void => {
		setIsNoteOpen(isOpen)
	}
	const [isHintOpen, setIsHintOpen] = useState(false)
	// the bookmark mark's accessible name
	const bookmarkLabel = resource.isBookmarked ? "Remove bookmark" : "Bookmark"
	// the hover highlight paints on a rounded under-layer, so the separator above the row stays straight
	return (
		<Popover open={isNoteOpen} onOpenChange={handleNoteOpenChange}>
			{/* the row is a pointer shortcut to the note. the title is the trigger that holds the semantics */}
			{/* biome-ignore lint/a11y/useKeyWithClickEvents: reachable by keyboard through the title trigger */}
			{/* biome-ignore lint/a11y/noStaticElementInteractions: a pointer shortcut over children that have the semantics */}
			<div
				onClick={() => handleNoteOpenChange(true)}
				onMouseEnter={() => setIsHintOpen(true)}
				onMouseLeave={() => setIsHintOpen(false)}
				className={cn(
					DASHED_ROW_CLASS,
					"group isolate flex cursor-pointer before:absolute before:inset-0 before:-z-10 before:rounded-lg before:transition-colors hover:before:bg-accent-foreground/20",
					// the finding whose chapter is playing stays highlighted
					isChapterPlaying && "before:bg-muted/70",
					className,
				)}
			>
				{/* the rank, in the slot the bookmark mark takes over once the finding is bookmarked.
				    on a phone the taller slot starts at the row top, level with the title */}
				{rank !== null && (
					<span
						className="text-muted-foreground absolute top-0 left-0 grid size-11 place-items-center sm:top-1.5 sm:size-8"
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
							className="text-primary absolute top-0 left-0 grid size-11 place-items-center sm:top-1.5 sm:size-8"
						>
							<Bookmark className="size-3.75 fill-current" strokeWidth={2.5} />
						</TooltipTrigger>
						<TooltipContent>
							<BookmarkMarkTooltip teamBookmarks={resource.teamBookmarks} />
						</TooltipContent>
					</Tooltip>
				)}
				{/* the left padding clears the rank slot, and the right padding is the row's own inset */}
				<TopicFindingSummary resource={resource} className="flex-1 py-3 pr-3 pl-9">
					{/* the pill of the podcast episode chapter that narrates this finding */}
					<FindingChapterPill podcastEpisode={latestPodcastEpisode} findingId={resource.findingId} />
				</TopicFindingSummary>
				{/* the note and its hint both anchor here, off the row's right edge */}
				<Tooltip open={isHintOpen && !isNoteOpen} onOpenChange={setIsHintOpen}>
					<TooltipTrigger asChild>
						<PopoverAnchor className="pointer-events-none absolute top-1.5 right-1 size-11 sm:size-8" />
					</TooltipTrigger>
					<TooltipContent side="top">A topic finding note from Carl</TooltipContent>
				</Tooltip>

				{/* the note itself, holding the rank, the link out, and Carl's words */}
				<ResourceInfo
					resource={resource}
					topicFindingRank={rank}
					podcastEpisode={latestPodcastEpisode}
					topic={topic}
					isRatable={isRatable}
					isBookmarkable={isBookmarkable}
					topicFeedHandlers={{ consumeTopicFinding, rateTopicFinding, bookmarkTopicFinding, openTopicFinding }}
				/>
			</div>
		</Popover>
	)
}

// the bookmark mark's tooltip, with the remove hint over everyone who kept the finding, the user first
function BookmarkMarkTooltip({ teamBookmarks }: { teamBookmarks: TopicFinding["teamBookmarks"] }) {
	// the user, then each team member who kept the finding
	const { data: session } = authClient.useSession()
	const sessionUser = session?.user
	const userBookmarks = sessionUser ? [toSessionProfileIdentity(sessionUser)] : []
	const teamMemberBookmarks = teamBookmarks.filter((teamBookmark) => teamBookmark.userId !== sessionUser?.id)

	// each bookmarking user by username, beside the user's avatar
	const bookmarkedByLines = [...userBookmarks, ...teamMemberBookmarks].map((bookmarkingUser) => ({
		key: bookmarkingUser.userId,
		line: <TooltipLabel>{bookmarkingUser.username}</TooltipLabel>,
		marker: (
			<UserAvatar
				userId={bookmarkingUser.userId}
				username={bookmarkingUser.username}
				avatarVersion={bookmarkingUser.avatarVersion}
				className="size-4"
			/>
		),
	}))
	return (
		<div className="space-y-1">
			<p>Remove your bookmark</p>
			<TooltipSection tooltipLines={bookmarkedByLines} />
		</div>
	)
}
