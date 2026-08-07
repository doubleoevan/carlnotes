import type { TopicFeed } from "@shared/contracts"
import { PawPrint } from "lucide-react"
import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { NoteIcon } from "@/components/branding/NoteIcon"
import { AnchorLink } from "@/components/common/AnchorLink"
import { Badge } from "@/components/primitives/badge"
import { Popover, PopoverCloseButton, PopoverContent, PopoverTrigger } from "@/components/primitives/popover"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import { TopicInfo } from "@/components/topic/TopicInfo"
import { useIsVisible } from "@/hooks/useIsVisible"
import { authClient } from "@/lib/authClient"
import { sendTopicSubscription } from "@/lib/topicClient"
import { cn, RAIL_ICON_INSET, RAIL_TEXT_INSET, RESOURCE_LIST_CARD_CLASS } from "@/lib/utils"
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

	// cap the resources shown unless the topic is expanded
	const resourcesShown = isExpanded ? topic.findings : topic.findings.slice(0, MAX_RESOURCES)
	const moreResourcesCount = topic.findings.length - MAX_RESOURCES
	// bookmarked rows sort first, so this count is exactly how many of the rows shown are pinned instead of being numbered
	const pinnedShownCount = resourcesShown.filter((resource) => resource.isBookmarked).length

	// hide the topic until it scrolls into view, then play the hydrate animation
	const { ref, isVisible } = useIsVisible<HTMLDivElement>()
	return (
		<div
			ref={ref}
			className={cn("py-2", isVisible ? "animate-hydrate" : "opacity-0")}
			style={{ animationDelay: `${Math.min(index, 3) * 50}ms` }}
		>
			{/* header: title linking to the topic page, info button, tag pills, and the "# new" count */}
			<div className="flex items-start justify-between gap-3">
				<div className="min-w-0">
					<div className="flex items-center gap-2">
						<AnchorLink href={`/topics/${topic.id}`} className="text-link min-w-0 hover:underline">
							<h3 className="font-display truncate pt-1 pl-4 pb-1 text-lg leading-tight">{topic.name}</h3>
						</AnchorLink>
						<TopicInfoPopover topic={topic} />
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
				{/* the "# new" count opens the info content, and the subscribe toggle sits to its right.
				    only a non-owner gets that toggle, so an owner's row ends in the count and takes the text inset instead */}
				<div className={cn(topic.isOwner ? RAIL_TEXT_INSET : RAIL_ICON_INSET, "flex shrink-0 items-center gap-1")}>
					{topic.newCount > 0 && <NewCountInfo topic={topic} />}
					{!topic.isOwner && <SubscribeToggle topic={topic} />}
				</div>
			</div>
			{/* resource rows, each drawing its own dashed separator */}
			<div className={cn(RESOURCE_LIST_CARD_CLASS, "mt-1.5 p-1")}>
				{resourcesShown.map((resource, index) => (
					<TopicResource
						key={resource.findingId}
						resource={resource}
						rank={resource.isBookmarked ? null : index - pinnedShownCount + 1}
						isRatable={topic.canRate}
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

// the subscribe icon beside the "# new" count. a visitor is sent to signup, a signed-in user toggles their topic subscription
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

	// the subscribe icon's tooltip
	const tooltip = !session ? "Sign up to subscribe" : topic.isSubscribed ? "Unsubscribe" : "Subscribe"
	return (
		<Tooltip>
			<TooltipTrigger
				onClick={handleClick}
				aria-pressed={topic.isSubscribed}
				aria-label={tooltip}
				className="text-muted-foreground hover:text-foreground grid size-11 shrink-0 place-items-center sm:size-7"
			>
				<PawPrint className={cn("size-3.75", topic.isSubscribed && "text-primary fill-current")} />
			</TooltipTrigger>
			<TooltipContent>{tooltip}</TooltipContent>
		</Tooltip>
	)
}

// the topic's note, opened from the note icon it sits under.
// anything passed as children opens the same note and shows the same tooltip, keeping the styling it arrived with
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
	// a caller that renders the icon inside its own heading includes these so the heading can open the note and show its tooltip
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

	// the topic note popover. stop propagation on the trigger and the close button so that the parent element doesn't reopen it
	const note = (
		<Popover open={isOpen} onOpenChange={setIsOpen}>
			<Tooltip open={isHintOpen && !isOpen} onOpenChange={setIsHintOpen}>
				<TooltipTrigger asChild>
					<PopoverTrigger
						onClick={(event) => event.stopPropagation()}
						className={cn(
							"hover:opacity-75 shrink-0",
							// for inline, the icon is a 20px tile in the text. it centers on the line instead of aligned with the text's bottom edge.
							// the pseudo-element grows the tap target back to 44px without taking any layout space
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
			<PopoverContent
				onClick={(event) => event.stopPropagation()}
				align="start"
				className="w-[calc(100vw-2rem)] max-w-lg text-sm"
			>
				<PopoverCloseButton />
				<TopicInfo topic={topic} />
			</PopoverContent>
		</Popover>
	)
	if (!children) {
		return note
	}

	// the topic finding opens the note popover
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
			<PopoverContent align="end" className="w-[calc(100vw-2rem)] max-w-lg text-sm">
				<PopoverCloseButton />
				<TopicInfo topic={topic} />
			</PopoverContent>
		</Popover>
	)
}
