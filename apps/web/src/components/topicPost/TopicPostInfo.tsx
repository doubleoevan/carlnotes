import { authClient } from "@carlnotes/client/authClient"
import { toTopicPath } from "@carlnotes/contracts/seo"
import {
	TopicPostInfo as SharedTopicPostInfo,
	type TopicPostInfoElements,
	type TopicPostInfoProps,
} from "@carlnotes/core/components/TopicPostInfo"
import { toTopicPostShare } from "@carlnotes/core/lib/topicPosts"
import { cn } from "@carlnotes/nightshift/classNames"
import { NotebookPen } from "lucide-react"
import type { ComponentProps } from "react"
import { CoffeeLoading } from "@/components/branding/CoffeeLoading"
import { NoteIcon } from "@/components/branding/NoteIcon"
import { AnchorLink } from "@/components/common/AnchorLink"
import { DetailsLine } from "@/components/common/DetailsLine"
import { ScrollBox } from "@/components/common/ScrollBox"
import { UserProfileLink } from "@/components/common/UserProfileLink"
import { PodcastEpisodePlayButton } from "@/components/podcast/PodcastEpisodePlayButton"
import { Popover, PopoverCloseButton, PopoverContent, PopoverTrigger } from "@/components/primitives/popover"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import { TOPIC_IMAGE_FRAME_CLASS } from "@/components/primitives/topic-image"
import { ShareTopic } from "@/components/share/ShareTopic"
import { ReactionRow } from "@/components/social/ReactionRow"
import { TopicImageLink } from "@/components/topic/TopicImageLink"
import { TopicInfoSection } from "@/components/topic/TopicInfoSection"
import {
	ICON_TILE_BUTTON_CLASS,
	MENU_BUTTON_CLASS,
	POPOVER_PANEL_CLASS,
	STANDALONE_LINK_CLASS,
	TITLE_ICON_BUTTON_CLASS,
} from "@/lib/styleClasses"

// the tile's button beside a title, and the one in a title's own text, raised onto the center of its capitals
const TRIGGER_CLASS = cn("z-10 shrink-0 hover:opacity-75", TITLE_ICON_BUTTON_CLASS)
const INLINE_TRIGGER_CLASS = cn(ICON_TILE_BUTTON_CLASS, "z-10 ml-2 -translate-y-1 hover:opacity-75")

// the popover's frame and its button's classes
type TopicPostInfoFrameProps = ComponentProps<TopicPostInfoElements["Frame"]> & { triggerClassName: string }

// the notebook and pen tile that opens the popover wherever a post offers it, above a card's stretched link. a click
// on the tile or inside the popover never reaches a row that opens the popover too
function TopicPostInfoFrame({ label, isOpen, onOpenChange, triggerClassName, children }: TopicPostInfoFrameProps) {
	return (
		<Popover open={isOpen} onOpenChange={onOpenChange}>
			<Tooltip>
				<TooltipTrigger asChild>
					<PopoverTrigger onClick={(event) => event.stopPropagation()} className={triggerClassName} aria-label={label}>
						<NoteIcon icon={NotebookPen} />
					</PopoverTrigger>
				</TooltipTrigger>
				<TooltipContent side="top">{label}</TooltipContent>
			</Tooltip>
			<PopoverContent onClick={(event) => event.stopPropagation()} align="end" className={POPOVER_PANEL_CLASS}>
				<PopoverCloseButton />
				{children}
			</PopoverContent>
		</Popover>
	)
}

// the web's elements, a Topic popover's: the note icon's popover, the title, the labeled sections, the author's link
// with the reactions and the Share button that opens the topic's share options for the post, the post's image at
// full width, linked to the post's page, the discussion's play button before its day, length, and hosts, the Topic's
// image beside its linked name, and the summary in the scroll box a Finding's notes sit in, whose copy button offers
// the summary as Markdown
const ELEMENTS: TopicPostInfoElements = {
	Frame: (props) => <TopicPostInfoFrame {...props} triggerClassName={TRIGGER_CLASS} />,
	// the title at the left, where a long one wraps cleanly, clear of the close button
	Title: ({ children }) => <h3 className="font-display mb-2 pr-8 text-lg leading-tight">{children}</h3>,
	Section: TopicInfoSection,
	AuthorRow: ({ share, children }) => (
		<div className="flex items-center justify-between gap-3">
			<div className="flex min-w-0 flex-wrap items-center gap-x-3">{children}</div>
			{share}
		</div>
	),
	Byline: ({ author }) => <UserProfileLink user={author} />,
	Reactions: ReactionRow,
	ShareButton: ({ topicPost }) => (
		<ShareTopic {...toTopicPostShare(topicPost)} className={cn(MENU_BUTTON_CLASS, "bg-muted hover:bg-accent")} />
	),
	TopicRow: ({ topic, image, details, onOpen }) => (
		<div className="flex items-center gap-3">
			{/* the Topic's image, which opens the Topic's page as the name does */}
			<TopicImageLink
				image={image}
				size="list"
				name={topic.name}
				className="h-12 w-18"
				path={toTopicPath(topic)}
				onOpen={onOpen}
			/>
			{/* the Topic's name, with its viewers and followers on the line under it */}
			<div className="min-w-0">
				<AnchorLink
					href={toTopicPath(topic)}
					onClick={onOpen}
					className={cn(STANDALONE_LINK_CLASS, "text-sm font-semibold break-words")}
				>
					{topic.name}
				</AnchorLink>
				<DetailsLine details={details} />
			</div>
		</div>
	),
	// the image is the popup's one link to the post's page, with its name for a keyboard and a screen reader
	Image: ({ image, name, path, onOpen }) => (
		<div className="py-3">
			<TopicImageLink
				image={image}
				size="page"
				name={name}
				className={cn(TOPIC_IMAGE_FRAME_CLASS, "w-full")}
				path={path}
				label={`Open ${name}`}
				onOpen={onOpen}
			/>
		</div>
	),
	DiscussionRow: ({ detailsText, children }) => (
		<div className="flex items-center gap-3">
			{children}
			{/* the server and the browser may sit in two time zones, so the day may differ on hydration */}
			<span className="text-muted-foreground text-xs" suppressHydrationWarning>
				{detailsText}
			</span>
		</div>
	),
	PlayButton: ({ podcastEpisode }) => <PodcastEpisodePlayButton podcastEpisode={podcastEpisode} size="default" />,
	Notes: ({ toCopyMarkdown, children }) => (
		<ScrollBox copyMarkdown={toCopyMarkdown(typeof window === "undefined" ? "" : window.location.origin)}>
			<p className="text-sm">{children}</p>
		</ScrollBox>
	),
	Unavailable: ({ children }) => <p className="text-muted-foreground text-sm">{children}</p>,
	Loading: () => <CoffeeLoading className="min-h-24 text-base" />,
}

// the frames of a popup whose tile sits in a title's own text, and of a row's popup
const INLINE_FRAME: TopicPostInfoElements["Frame"] = (props) => (
	<TopicPostInfoFrame {...props} triggerClassName={INLINE_TRIGGER_CLASS} />
)
const ROW_FRAME: TopicPostInfoElements["Frame"] = (props) => (
	<TopicPostInfoFrame {...props} triggerClassName={TRIGGER_CLASS} />
)

// what a web popup takes: the post's id and title, the open state a row holds, and the elements an MCP view replaces
type WebTopicPostInfoProps = TopicPostInfoProps & { elements?: Partial<TopicPostInfoElements> }

/**
 * A Topic Post's info popup on the web, a popover under its notebook and pen tile, which sits beside a title or in
 * its text.
 */
export function TopicPostInfo({ isInline, elements, ...props }: WebTopicPostInfoProps & { isInline?: boolean }) {
	const { data: session } = authClient().useSession()
	return (
		<SharedTopicPostInfo
			{...props}
			userId={session?.user.id ?? null}
			elements={{ ...ELEMENTS, ...(isInline && { Frame: INLINE_FRAME }), ...elements }}
		/>
	)
}

/**
 * A Topic Post's info popup on the web under the notebook and pen tile, for a row that holds only the post's id. The
 * row opens the popup too, through isOpen and onOpenChange.
 */
export function TopicPostInfoButton({ elements, ...props }: WebTopicPostInfoProps) {
	const { data: session } = authClient().useSession()
	return (
		<SharedTopicPostInfo
			{...props}
			userId={session?.user.id ?? null}
			elements={{ ...ELEMENTS, Frame: ROW_FRAME, ...elements }}
		/>
	)
}
