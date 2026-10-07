import type { TopicFeed } from "@shared/contracts"
import { toTopicPath } from "@shared/seo"
import { useNavigate } from "@tanstack/react-router"
import { PawPrint } from "lucide-react"
import { useState } from "react"
import { authClient } from "@/clients/authClient"
import { sendTopicSubscription } from "@/clients/topicClient"
import { NoteIcon } from "@/components/branding/NoteIcon"
import { AnchorLink } from "@/components/common/AnchorLink"
import { PageUpdateCountBadge } from "@/components/common/UpdateCountBadge"
import { UserProfileLink } from "@/components/common/UserProfileLink"
import { LatestPodcastEpisodePlayButton } from "@/components/podcast/LatestPodcastEpisodePlayButton"
import { Badge } from "@/components/primitives/badge"
import { Popover, PopoverCloseButton, PopoverContent, PopoverTrigger } from "@/components/primitives/popover"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import { ShareTopic } from "@/components/share/ShareTopic"
import { TeamLink } from "@/components/team/TeamLink"
import { TopicInfo } from "@/components/topic/TopicInfo"
import { useRevealClassName } from "@/hooks/useRevealClassName"
import { POPOVER_PANEL_CLASS, RAIL_BARE_ICON_INSET, RAIL_TEXT_INSET } from "@/lib/styleClasses"
import { cn } from "@/lib/utils"
import { useTopicFeed } from "@/providers/TopicFeedProvider"
import { TopicFindingList } from "./TopicFindingsSection"

// the note icon's button and the play button beside the note icon, in a heading's own text flow and beside a heading.
// each tap area reaches past the tile, so the icons sit close together on a phone too. inline, the first icon keeps
// the gap from the title that a heading's row gives
const INLINE_ICON_BUTTON_CLASS =
	"relative ml-2.5 inline-grid size-5 -translate-y-1 place-items-center align-middle before:absolute before:-inset-3 before:content-['']"
const ICON_BUTTON_CLASS = "relative grid size-7 place-items-center before:absolute before:-inset-2 before:content-['']"

// the topic feed and its position in the section. the position staggers the entrance animation
type TopicProps = { topic: TopicFeed; index: number }

// the team and the owner that a topic's byline chooses between
type TopicBylineProps = { topic: Pick<TopicFeed, "teamLink" | "owner">; className?: string }

/**
 * A topic's byline, which names the team for anyone who can open the team's page and the topic's owner otherwise.
 */
export function TopicByline({ topic, className }: TopicBylineProps) {
	// name the team if there is a team link, and the owner otherwise
	if (topic.teamLink) {
		return <TeamLink team={topic.teamLink} className={className} />
	}
	return topic.owner ? <UserProfileLink user={topic.owner} label="Brewed by" className={className} /> : null
}

/**
 * A single topic in the feed. The topic header, then up to five topic resource rows.
 * It stays hidden until scrolled into view, then plays the hydrate animation.
 */
export function Topic({ topic, index }: TopicProps) {
	// a card the server rendered is shown at once, and one rendered in the browser fades in as it scrolls into view
	const { ref, revealClassName } = useRevealClassName<HTMLDivElement>({ isAnimatedOnServer: false })
	return (
		<div
			ref={ref}
			data-reveal
			className={cn("py-1.5", revealClassName)}
			style={{ animationDelay: `${Math.min(index, 3) * 50}ms` }}
		>
			{/* header: the title takes the whole row and wraps instead of truncating, with the byline and
			    the actions sharing the line below it */}
			<div>
				<div className="flex items-center gap-2">
					{/* the chat mention count sits at the name's top-right corner while the user has unseen chat mentions */}
					<span className="relative inline-block min-w-0">
						<AnchorLink href={toTopicPath(topic)} className="text-link min-w-0 hover:underline">
							<h3 className="font-display pt-1 pl-4 pb-1 text-lg leading-tight">{topic.name}</h3>
						</AnchorLink>
						<PageUpdateCountBadge topicId={topic.id} className="-right-2" />
					</span>
					<TopicInfoPopover topic={topic} />
				</div>
				<div className="flex items-center justify-between gap-3">
					{/* the topic creator byline */}
					<div className="min-w-0">
						<TopicByline topic={topic} className="mt-1 pl-4 text-xs" />
					</div>
					{/* the "# new" count opens the info content, and the subscribe toggle sits to its right.
					    the row ends in the share icon, so it takes the bare-icon inset */}
					<div
						className={cn(
							topic.isTopicOwner && topic.visibility === "private" ? RAIL_TEXT_INSET : RAIL_BARE_ICON_INSET,
							"flex shrink-0 items-center gap-1",
						)}
					>
						{topic.newCount > 0 && <NewCountInfo topic={topic} />}
						{!topic.isTopicOwner && <SubscribeToggle topic={topic} />}
						<ShareTopic
							topic={topic}
							isIcon
							className="text-muted-foreground hover:text-foreground grid h-11 w-7 shrink-0 place-items-center sm:size-7"
						/>
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
			{/* the topic finding rows, with the latest podcast episode's chapter pills */}
			<TopicFindingList
				topicFindings={topic.findings}
				isRatable={topic.canRate}
				isBookmarkable={topic.isTopicOwner || topic.isTeamMember}
				topic={{ id: topic.id, name: topic.name, prompt: topic.prompt }}
				latestPodcastEpisode={topic.latestPodcastEpisode}
				emptyText="Nothing new worth your time yet. Carl has standards."
				className="mt-1.5"
				moreButtonClassName="pl-12"
			/>
		</div>
	)
}

// the subscribe icon beside the "# new" count
function SubscribeToggle({ topic }: { topic: TopicFeed }) {
	const navigate = useNavigate()
	const { reloadTopicFeed } = useTopicFeed()
	const { data: session } = authClient.useSession()

	// a visitor is sent to signup, a signed-in user toggles their topic subscription and reloads the topic feed
	async function handleClick(): Promise<void> {
		if (!session) {
			void navigate({ to: "/signup", search: { cta: "subscribe" } })
			return
		}
		await sendTopicSubscription(topic.id, !topic.isSubscribed)
		await reloadTopicFeed()
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

	// the latest podcast episode's play button, then the topic note popover. inline, each icon is a tile in the text
	const iconButtonClass = isInline ? INLINE_ICON_BUTTON_CLASS : ICON_BUTTON_CLASS
	const iconButtons = (
		<>
			{topic.latestPodcastEpisode && (
				<LatestPodcastEpisodePlayButton
					podcastEpisode={topic.latestPodcastEpisode}
					className={iconButtonClass}
					// the play button's own tooltip replaces the note hint that a heading around the play button opens
					onMouseEnter={() => setTimeout(() => setIsHintOpen(false), 0)}
				/>
			)}
			<Popover open={isOpen} onOpenChange={setIsOpen}>
				<Tooltip open={isHintOpen && !isOpen} onOpenChange={setIsHintOpen}>
					<TooltipTrigger asChild>
						<PopoverTrigger
							onClick={(event) => event.stopPropagation()}
							className={cn(
								"hover:opacity-75 shrink-0",
								iconButtonClass,
								// inline, the note icon keeps a gap from the play button, whose tile overflows its slot
								isInline && topic.latestPodcastEpisode && "ml-2",
							)}
							aria-label="Topic details"
						>
							<NoteIcon />
						</PopoverTrigger>
					</TooltipTrigger>
					<TooltipContent side="top">A topic note from Carl</TooltipContent>
				</Tooltip>
				<PopoverContent onClick={(event) => event.stopPropagation()} align="start" className={POPOVER_PANEL_CLASS}>
					<PopoverCloseButton />
					<TopicInfo topic={topic} />
				</PopoverContent>
			</Popover>
		</>
	)

	// inline, the icons sit in the heading's own text. beside a heading, a box around the icons keeps the row's gap from between the icons
	const iconButtonGroup = isInline ? iconButtons : <div className="flex shrink-0 items-center">{iconButtons}</div>
	if (!children) {
		return iconButtonGroup
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
			{iconButtonGroup}
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
			<PopoverContent align="end" className={POPOVER_PANEL_CLASS}>
				<PopoverCloseButton />
				<TopicInfo topic={topic} />
			</PopoverContent>
		</Popover>
	)
}
