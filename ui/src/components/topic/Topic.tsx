import type { TopicFeed } from "@shared/contracts"
import { PawPrint } from "lucide-react"
import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { authClient } from "@/clients/authClient"
import { sendTopicSubscription } from "@/clients/topicClient"
import { NoteIcon } from "@/components/branding/NoteIcon"
import { AnchorLink } from "@/components/common/AnchorLink"
import { UserProfileLink } from "@/components/common/UserProfileLink"
import { Badge } from "@/components/primitives/badge"
import { Popover, PopoverCloseButton, PopoverContent, PopoverTrigger } from "@/components/primitives/popover"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import { ShareTopic } from "@/components/share/ShareTopic"
import { TeamLink } from "@/components/team/TeamLink"
import { TopicInfo } from "@/components/topic/TopicInfo"
import { TopicMentionBadge } from "@/components/topic/TopicMentionBadge"
import { useIsVisible } from "@/hooks/useIsVisible"
import {
	POPOVER_WIDTH_CLASS,
	RAIL_BARE_ICON_INSET,
	RAIL_TEXT_INSET,
	RESOURCE_LIST_CARD_CLASS,
} from "@/lib/styleClasses"
import { cn } from "@/lib/utils"
import { useTopicFeed } from "@/providers/TopicFeedProvider"
import { MoreButton } from "./MoreButton"
import { TopicResource } from "./TopicResource"

// the max resource rows shown before the "+ # more" expander
const MAX_RESOURCES = 5

// the topic feed and its position in the section. the position staggers the entrance animation
type TopicProps = { topic: TopicFeed; index: number }

/**
 * A single topic in the feed. The topic header, then up to five topic resource rows.
 * It stays hidden until scrolled into view, then plays the hydrate animation.
 */
export function Topic({ topic, index }: TopicProps) {
	const [isExpanded, setIsExpanded] = useState(false)

	// limit the resources shown unless the topic is expanded
	const resourcesShown = isExpanded ? topic.findings : topic.findings.slice(0, MAX_RESOURCES)
	const moreResourcesCount = topic.findings.length - MAX_RESOURCES
	// bookmarked rows sort first, so this count is exactly how many of the rows shown are pinned instead of being numbered
	const pinnedShownCount = resourcesShown.filter((resource) => resource.isBookmarked).length

	const { ref, isVisible } = useIsVisible<HTMLDivElement>()
	return (
		<div
			ref={ref}
			className={cn("py-1.5", isVisible ? "animate-hydrate" : "opacity-0")}
			style={{ animationDelay: `${Math.min(index, 3) * 50}ms` }}
		>
			{/* header: the title takes the whole row and wraps instead of truncating, with the credit and
			    the actions sharing the line below it */}
			<div>
				<div className="flex items-center gap-2">
					{/* the mention count sits at the name's top-right corner while the user has unseen mentions */}
					<span className="relative inline-block min-w-0">
						<AnchorLink href={`/topics/${topic.id}`} className="text-link min-w-0 hover:underline">
							<h3 className="font-display pt-1 pl-4 pb-1 text-lg leading-tight">{topic.name}</h3>
						</AnchorLink>
						<TopicMentionBadge topicId={topic.id} className="-right-2" />
					</span>
					<TopicInfoPopover topic={topic} />
				</div>
				<div className="flex items-center justify-between gap-3">
					{/* the credit is derived: the team for anyone who can open its page, the creator otherwise */}
					<div className="min-w-0">
						{topic.teamLink ? (
							<TeamLink team={topic.teamLink} className="mt-1 pl-4 text-xs" avatarClassName="size-4" />
						) : (
							topic.owner && (
								<UserProfileLink
									user={topic.owner}
									label="Brewed by"
									avatarClassName="size-4"
									className="mt-1 pl-4 text-xs"
								/>
							)
						)}
					</div>
					{/* the "# new" count opens the info content, and the subscribe toggle sits to its right.
					    the inset follows the row's last element: an icon everywhere but an owner's private topic, which ends in the count */}
					<div
						className={cn(
							topic.isOwner && topic.visibility === "private" ? RAIL_TEXT_INSET : RAIL_BARE_ICON_INSET,
							"flex shrink-0 items-center gap-1",
						)}
					>
						{topic.newCount > 0 && <NewCountInfo topic={topic} />}
						{!topic.isOwner && <SubscribeToggle topic={topic} />}
						{topic.visibility !== "private" && (
							<ShareTopic
								topicId={topic.id}
								topicName={topic.name}
								isPublic={topic.visibility === "public"}
								canInvite={topic.isOwner}
								isIcon
								className="text-muted-foreground hover:text-foreground grid h-11 w-7 shrink-0 place-items-center sm:size-7"
							/>
						)}
					</div>
				</div>
				{/* tags, left-padded to line the text up with the resource icons below them.
				     an untagged topic renders no row at all */}
				{topic.tags.length > 0 && (
					<div className="mt-1.5 mb-1.5 pl-3 flex flex-wrap gap-1">
						{topic.tags.map((tag) => (
							<Badge key={tag} variant="secondary">
								{tag}
							</Badge>
						))}
					</div>
				)}
			</div>
			{/* resource rows, each drawing its own dashed separator */}
			<div className={cn(RESOURCE_LIST_CARD_CLASS, "mt-1.5 p-1")}>
				{resourcesShown.map((resource, index) => (
					<TopicResource
						key={resource.findingId}
						resource={resource}
						rank={resource.isBookmarked ? null : index - pinnedShownCount + 1}
						isRatable={topic.canRate}
						isBookmarkable={topic.isOwner || topic.roomTeams.length > 0}
						topic={{ id: topic.id, name: topic.name, prompt: topic.prompt }}
					/>
				))}
				{resourcesShown.length === 0 && (
					<p className="text-muted-foreground py-3 pl-2 text-sm">
						Nothing new worth your time yet. Carl has standards.
					</p>
				)}
			</div>
			{moreResourcesCount > 0 && (
				<MoreButton
					isExpanded={isExpanded}
					moreLabel={`+ ${moreResourcesCount} more `}
					onToggle={() => setIsExpanded(!isExpanded)}
					className="pl-12"
				/>
			)}
		</div>
	)
}

// the subscribe icon beside the "# new" count
function SubscribeToggle({ topic }: { topic: TopicFeed }) {
	const navigate = useNavigate()
	const { reload } = useTopicFeed()
	const { data: session } = authClient.useSession()

	// a visitor is sent to signup, a signed-in user toggles their topic subscription and reloads the topic feed
	async function handleClick(): Promise<void> {
		if (!session) {
			navigate("/signup?cta=subscribe")
			return
		}
		await sendTopicSubscription(topic.id, !topic.isSubscribed)
		await reload()
	}

	const tooltip = !session ? "Sign up to follow" : topic.isSubscribed ? "Unfollow" : "Follow"
	return (
		<Tooltip>
			<TooltipTrigger
				onClick={handleClick}
				aria-pressed={topic.isSubscribed}
				aria-label={tooltip}
				className="text-muted-foreground hover:text-foreground grid h-11 w-7 shrink-0 place-items-center sm:size-7"
			>
				<PawPrint className={cn("size-3.75", topic.isSubscribed && "text-primary fill-current")} />
			</TooltipTrigger>
			<TooltipContent>{tooltip}</TooltipContent>
		</Tooltip>
	)
}

// the topic's note, opened from the note icon it sits under
export function TopicInfoPopover({
	topic,
	children,
	isInline = false,
	isOpen: openFromCaller,
	onOpenChange,
	isHintOpen: hintFromCaller,
	onHintOpenChange,
}: {
	topic: TopicFeed
	children?: React.ReactNode
	// whether the icon sits in a heading's own text flow
	isInline?: boolean
	// a caller that renders the icon inside its own heading passes these so the heading can open the note and show its tooltip
	isOpen?: boolean
	onOpenChange?: (isOpen: boolean) => void
	isHintOpen?: boolean
	onHintOpenChange?: (isHintOpen: boolean) => void
}) {
	const [openHere, setOpenHere] = useState(false)
	const [hintOpenHere, setHintOpenHere] = useState(false)
	const isOpen = openFromCaller ?? openHere
	const setIsOpen = onOpenChange ?? setOpenHere
	const isHintOpen = hintFromCaller ?? hintOpenHere
	const setIsHintOpen = onHintOpenChange ?? setHintOpenHere

	// the topic note popover
	const note = (
		<Popover open={isOpen} onOpenChange={setIsOpen}>
			<Tooltip open={isHintOpen && !isOpen} onOpenChange={setIsHintOpen}>
				<TooltipTrigger asChild>
					<PopoverTrigger
						onClick={(event) => event.stopPropagation()}
						className={cn(
							"hover:opacity-75 shrink-0",
							// for inline, the icon is a 20px tile in the text
							isInline
								? "relative ml-1 inline-grid size-5 -translate-y-1 place-items-center align-middle before:absolute before:-inset-3 before:content-['']"
								: "grid size-11 place-items-center sm:size-7",
						)}
						aria-label="Topic details"
					>
						<NoteIcon />
					</PopoverTrigger>
				</TooltipTrigger>
				<TooltipContent side="top">A topic note from Carl</TooltipContent>
			</Tooltip>
			<PopoverContent onClick={(event) => event.stopPropagation()} align="start" className={POPOVER_WIDTH_CLASS}>
				<PopoverCloseButton />
				<TopicInfo topic={topic} />
			</PopoverContent>
		</Popover>
	)
	if (!children) {
		return note
	}

	// clicking the children opens the note popover
	return (
		// biome-ignore lint/a11y/useKeyWithClickEvents: the note button beside it is the keyboard path
		// biome-ignore lint/a11y/noStaticElementInteractions: a pointer shortcut to the button it sits beside
		<div
			onClick={() => setIsOpen(true)}
			onMouseEnter={() => setIsHintOpen(true)}
			onMouseLeave={() => setIsHintOpen(false)}
			className="flex min-w-0 cursor-pointer items-start gap-1"
		>
			{children}
			{note}
		</div>
	)
}

// the "# new" count as its own popover trigger, showing the same info content anchored at the count on the right
export function NewCountInfo({ topic }: { topic: TopicFeed }) {
	return (
		<Popover>
			<Tooltip>
				<TooltipTrigger asChild>
					<PopoverTrigger className="text-badge hover:opacity-75 shrink-0 text-sm font-semibold">
						{topic.newCount} new
					</PopoverTrigger>
				</TooltipTrigger>
				<TooltipContent>A topic note from Carl</TooltipContent>
			</Tooltip>
			<PopoverContent align="end" className={POPOVER_WIDTH_CLASS}>
				<PopoverCloseButton />
				<TopicInfo topic={topic} />
			</PopoverContent>
		</Popover>
	)
}
