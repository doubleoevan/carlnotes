import { authClient } from "@carlnotes/client/authClient"
import { sendTopicSubscription } from "@carlnotes/client/topicClient"
import { toTopicPath } from "@carlnotes/contracts/seo"
import type { TopicDetails, TopicFeed } from "@carlnotes/contracts/topics"
import { cn } from "@carlnotes/nightshift/classNames"
import { ICON_ACTION_CLASS } from "@carlnotes/nightshift/iconAction"
import { useNavigate } from "@tanstack/react-router"
import { PawPrint } from "lucide-react"
import { useState } from "react"
import { AnchorLink } from "@/components/common/AnchorLink"
import { PageUpdateCountBadge } from "@/components/common/UpdateCountBadge"
import { PodcastEpisodePlayButton } from "@/components/podcast/PodcastEpisodePlayButton"
import { Badge } from "@/components/primitives/badge"
import { Popover, PopoverCloseButton, PopoverContent, PopoverTrigger } from "@/components/primitives/popover"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import { TOPIC_IMAGE_FRAME_CLASS } from "@/components/primitives/topic-image"
import { toSignupNavigation } from "@/components/session/signupPrompts"
import { ShareTopic } from "@/components/share/ShareTopic"
import { useRevealClassName } from "@/hooks/useRevealClassName"
import { TOPIC_HEADER_AREA_CLASSES, toTopicHeaderGridClass } from "@/lib/pageHeaderClasses"
import {
	ACTIVE_ICON_CLASS,
	LIST_TOPIC_IMAGE_CLASS,
	POPOVER_PANEL_CLASS,
	RAIL_BARE_ICON_INSET,
	RAIL_TEXT_INSET,
	STANDALONE_LINK_CLASS,
	TITLE_ICON_BUTTON_CLASS,
} from "@/lib/styleClasses"
import { useTopicFeed } from "@/providers/TopicFeedProvider"
import { TopicByline } from "./TopicByline"
import { TopicFindingList } from "./TopicFindingsSection"
import { TopicImageLink } from "./TopicImageLink"
import { TopicInfo } from "./TopicInfo"
import { TOPIC_NOTE_TOOLTIP, TopicNoteTrigger } from "./TopicNoteTrigger"

// the note icon's button and the play button beside the note icon, in a heading's own text flow and beside a heading.
// each tap area reaches past the tile, so the icons sit close together on a phone too. inline, the first icon keeps
// the gap from the title that a heading's row gives
const INLINE_ICON_BUTTON_CLASS =
	"relative ml-2.5 inline-grid size-5 -translate-y-1 place-items-center align-middle before:absolute before:-inset-3 before:content-['']"
// a follow or share icon in the row under a topic card's title, as tall as a touch target on a phone
const ICON_ACTION_ROW_BUTTON_CLASS =
	"text-muted-foreground hover:text-foreground grid h-11 shrink-0 place-items-center sm:h-7"

// the topic feed, the card's classes, and its position on the section's page, which staggers the entrance animation
type TopicProps = { topic: TopicFeed; index: number; className?: string }

/**
 * A single topic in the feed. The topic header, then up to five topic resource rows.
 * It stays hidden until scrolled into view, then plays the hydrate animation.
 */
export function Topic({ topic, index, className }: TopicProps) {
	// a card the server rendered is shown at once, and one rendered in the browser fades in as it scrolls into view
	const { ref, revealClassName } = useRevealClassName<HTMLDivElement>({ isAnimatedOnServer: false })
	return (
		<div
			ref={ref}
			data-reveal
			className={cn(revealClassName, className)}
			style={{ animationDelay: `${Math.min(index, 3) * 50}ms` }}
		>
			{/* header: the image at the left edge of the findings card, with the title, the tags, and the byline beside
			    it. the actions end the header's last row at the right, over the findings card's top right corner. on a
			    phone the byline row sits under the image, with the same space below it as above it */}
			<div
				className={cn(toTopicHeaderGridClass({ hasTags: topic.tags.length > 0, hasActions: true }), "max-sm:mb-1.5")}
			>
				{/* the image opens the topic's page as the title does, and its link is no taller than the image */}
				<TopicImageLink
					image={topic.image}
					size="page"
					name={topic.name}
					className={cn(LIST_TOPIC_IMAGE_CLASS, TOPIC_IMAGE_FRAME_CLASS)}
					path={toTopicPath(topic)}
					linkClassName={cn(TOPIC_HEADER_AREA_CLASSES.image, "self-start")}
				/>
				{/* the title wraps, and its play and note icons follow its last word. the chat mention count sits at the
				    name's top-right corner while the user has unseen chat mentions */}
				<h3 className={cn(TOPIC_HEADER_AREA_CLASSES.title, "font-display pb-1 text-lg leading-tight")}>
					<span className="relative">
						<AnchorLink href={toTopicPath(topic)} className={STANDALONE_LINK_CLASS}>
							{topic.name}
						</AnchorLink>
						<PageUpdateCountBadge topicId={topic.id} className="-right-2" />
					</span>
					<TopicInfoPopover topic={topic} isInline />
				</h3>
				{/* tags, lined up with the title. an untagged topic renders no row at all */}
				{topic.tags.length > 0 && (
					<div className={TOPIC_HEADER_AREA_CLASSES.tags}>
						{topic.tags.map((tag) => (
							<Badge key={tag} variant="secondary">
								{tag}
							</Badge>
						))}
					</div>
				)}
				{/* the byline, with the actions at the right of its row */}
				<div className={TOPIC_HEADER_AREA_CLASSES.bylineRow}>
					{/* the topic creator byline */}
					<TopicByline topic={topic} className={cn(TOPIC_HEADER_AREA_CLASSES.byline, "text-xs")} />
					{/* the "# new" count opens the info content, and the subscribe toggle sits to its right. the row ends in
					    the share icon, so it takes the bare-icon inset. on a phone the touch boxes reach into the gaps around
					    their row instead of making it taller. from sm up the row hangs below the header's bottom by the space
					    under the icons in their touch boxes, so the icons end level with the image's bottom */}
					<div
						className={cn(
							TOPIC_HEADER_AREA_CLASSES.actions,
							topic.isTopicOwner && topic.visibility === "private" ? RAIL_TEXT_INSET : RAIL_BARE_ICON_INSET,
							"flex items-center justify-end max-sm:-my-2.5 sm:-mb-1.5",
						)}
					>
						{topic.newCount > 0 && <NewCountInfo topic={topic} />}
						{!topic.isTopicOwner && <SubscribeToggle topic={topic} />}
						<ShareTopic topic={topic} isIcon className={cn(ICON_ACTION_ROW_BUTTON_CLASS, ICON_ACTION_CLASS)} />
					</div>
				</div>
			</div>
			{/* the topic finding rows, with the latest podcast episode's chapter pills */}
			<TopicFindingList
				topicFindings={topic.findings}
				isRatable={topic.canRate}
				isBookmarkable={topic.isTopicOwner || topic.isTeamMember}
				topic={{
					id: topic.id,
					name: topic.name,
					prompt: topic.prompt,
					visibility: topic.visibility,
					owner: topic.owner,
					teamLink: topic.teamLink,
					image: topic.image,
				}}
				latestPodcastEpisode={topic.latestPodcastEpisode}
				emptyText="Nothing new worth your time yet. Carl has standards."
				fullListHref={toTopicPath(topic)}
			/>
		</div>
	)
}

// the subscribe icon beside the "# new" count
function SubscribeToggle({ topic }: { topic: TopicFeed }) {
	const navigate = useNavigate()
	const { reloadTopicFeed } = useTopicFeed()
	const { data: session } = authClient().useSession()

	// a visitor is sent to signup, a signed-in user toggles their topic subscription and reloads the topic feed
	async function handleClick(): Promise<void> {
		if (!session) {
			void navigate(toSignupNavigation("subscribe"))
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
				className={cn(ICON_ACTION_ROW_BUTTON_CLASS, ICON_ACTION_CLASS)}
			>
				<PawPrint className={cn("size-3.75", topic.isSubscribed && ACTIVE_ICON_CLASS)} />
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
	topic: TopicDetails
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
	const iconButtonClass = isInline ? INLINE_ICON_BUTTON_CLASS : TITLE_ICON_BUTTON_CLASS
	const iconButtons = (
		<>
			{topic.latestPodcastEpisode && (
				<PodcastEpisodePlayButton
					podcastEpisode={topic.latestPodcastEpisode}
					className={iconButtonClass}
					// the play button's own tooltip replaces the note hint that a heading around the play button opens
					onMouseEnter={() => setTimeout(() => setIsHintOpen(false), 0)}
				/>
			)}
			<Popover open={isOpen} onOpenChange={setIsOpen}>
				<TopicNoteTrigger
					className={cn(
						iconButtonClass,
						// inline, the note icon keeps a gap from the play button, whose tile overflows its slot
						isInline && topic.latestPodcastEpisode && "ml-2",
					)}
					isHintOpen={isHintOpen && !isOpen}
					onHintOpenChange={setIsHintOpen}
				/>
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
export function NewCountInfo({ topic }: { topic: TopicDetails }) {
	// close Topic info before opening a Finding from its Personal sources
	const [isOpen, setIsOpen] = useState(false)
	return (
		<Popover open={isOpen} onOpenChange={setIsOpen}>
			<Tooltip>
				<TooltipTrigger asChild>
					<PopoverTrigger className="text-badge shrink-0 pr-1 text-sm font-semibold hover:underline">
						{topic.newCount} new
					</PopoverTrigger>
				</TooltipTrigger>
				<TooltipContent>{TOPIC_NOTE_TOOLTIP}</TooltipContent>
			</Tooltip>
			<PopoverContent align="end" className={POPOVER_PANEL_CLASS}>
				<PopoverCloseButton />
				<TopicInfo topic={topic} />
			</PopoverContent>
		</Popover>
	)
}
