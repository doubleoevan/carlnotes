import type { TopicFeed } from "@shared/contracts"
import { Bell, SquarePen } from "lucide-react"
import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { AnchorLink } from "@/components/layout/AnchorLink"
import { Badge } from "@/components/primitives/badge"
import { Popover, PopoverCloseButton, PopoverContent, PopoverTrigger } from "@/components/primitives/popover"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import { TopicInfo } from "@/components/topic/TopicInfo"
import { useIsVisible } from "@/hooks/useIsVisible"
import { authClient } from "@/lib/authClient"
import { sendTopicSubscription } from "@/lib/topicClient"
import { cn, toSubscribeTooltip } from "@/lib/utils"
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
	// bookmarked rows sort first, so this count is exactly how many of the rows shown are pinned rather than numbered
	const pinnedShownCount = resourcesShown.filter((resource) => resource.isBookmarked).length

	// hide the topic until it scrolls into view, then play the hydrate animation
	const { ref, isVisible } = useIsVisible<HTMLDivElement>()
	return (
		<div
			ref={ref}
			className={cn("py-4", isVisible ? "animate-hydrate" : "opacity-0")}
			style={{ animationDelay: `${Math.min(index, 3) * 50}ms` }}
		>
			{/* header: title linking to the topic page, info button, tag pills, and the "# new" count */}
			<div className="flex items-start justify-between gap-3">
				<div className="min-w-0">
					<div className="flex items-center gap-2">
						<AnchorLink href={`/topics/${topic.id}`} className="min-w-0 hover:underline">
							<h3 className="font-display truncate pt-1 pl-4 pb-1 text-lg leading-tight">{topic.name}</h3>
						</AnchorLink>
						<TopicInfoPopover topic={topic} />
					</div>
					{/* tags, left-padded to line the text up with the resource icons below them */}
					<div className="mt-1.5 pl-3 flex flex-wrap gap-1">
						{topic.tags.map((tag) => (
							<Badge key={tag} variant="secondary">
								{tag}
							</Badge>
						))}
					</div>
				</div>
				{/* the "# new" count opens the info content, and the subscribe bell sits to its right */}
				<div className="flex shrink-0 items-center gap-1">
					{topic.newCount > 0 && <NewCountInfo topic={topic} />}
					{!topic.isOwner && <SubscribeBell topic={topic} />}
				</div>
			</div>
			{/* resource rows with dashed separators between them */}
			<div className="divide-separator mt-1 pl-3 divide-y divide-dashed">
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

// the subscribe bell beside the "# new" count. a visitor is sent to signup, a signed-in user toggles their topic subscription
function SubscribeBell({ topic }: { topic: TopicFeed }) {
	const navigate = useNavigate()
	const { reload } = useTopicFeed()
	const { data: session } = authClient.useSession()

	// a visitor is sent to signup, a signed-in user toggles their topic subscription and reloads the topic feed
	async function handleClick(): Promise<void> {
		if (!session) {
			navigate("/signup")
			return
		}
		await sendTopicSubscription(topic.id, !topic.isSubscribed)
		await reload()
	}

	// the subscribe bell with its tooltip
	const tooltip = toSubscribeTooltip(Boolean(session), topic.isSubscribed, false)
	return (
		<Tooltip>
			<TooltipTrigger
				onClick={handleClick}
				aria-pressed={topic.isSubscribed}
				aria-label={tooltip}
				className="text-muted-foreground hover:text-foreground grid size-11 shrink-0 place-items-center sm:size-7"
			>
				<Bell className={cn("size-3.75", topic.isSubscribed && "text-primary fill-current")} />
			</TooltipTrigger>
			<TooltipContent>{tooltip}</TooltipContent>
		</Tooltip>
	)
}

// the topic info popover from the note icon anchored at the icon
function TopicInfoPopover({ topic }: { topic: TopicFeed }) {
	return (
		<Popover>
			<Tooltip>
				<TooltipTrigger asChild>
					<PopoverTrigger
						className="text-primary hover:opacity-75 grid size-11 shrink-0 place-items-center sm:size-7"
						aria-label="Topic details"
					>
						<SquarePen className="size-3.75" strokeWidth={2.5} />
					</PopoverTrigger>
				</TooltipTrigger>
				<TooltipContent>A topic note from Carl</TooltipContent>
			</Tooltip>
			<PopoverContent align="start" className="w-[calc(100vw-2rem)] max-w-lg text-sm">
				<PopoverCloseButton />
				<TopicInfo topic={topic} />
			</PopoverContent>
		</Popover>
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
