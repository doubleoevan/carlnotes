import { NEWS_PAGE_SIZE, type NewsEvent, type NewsEventKind } from "@carlnotes/contracts/news"
import {
	type NewsListElements,
	type NewsListRowProps,
	NewsList as SharedNewsList,
} from "@carlnotes/core/components/NewsList"
import type { TopicPostInfoElements } from "@carlnotes/core/components/TopicPostInfo"
import { toTopicPostTitle } from "@carlnotes/core/lib/topicPosts"
import { cn } from "@carlnotes/nightshift/classNames"
import { ChevronRight, Coffee, FileText, Heart, type LucideIcon, MessageCircle, Mic, PenLine } from "lucide-react"
import { type ComponentProps, useState } from "react"
import { AnchorLink } from "@/components/common/AnchorLink"
import { DotSeparatedTexts } from "@/components/common/DotSeparatedTexts"
import { Pagination } from "@/components/common/Pagination"
import { FindingChapterPill, PodcastEpisodeNumberPill } from "@/components/podcast/PodcastEpisodePill"
import { PodcastEpisodeVideoButton } from "@/components/podcast/PodcastEpisodeVideoButton"
import { Button } from "@/components/primitives/button"
import { SearchResultRow } from "@/components/search/SearchResultRow"
import { SearchRowTopicDetail } from "@/components/search/SearchRowParts"
import { TopicImageLink } from "@/components/topic/TopicImageLink"
import { TopicNotePopover } from "@/components/topic/TopicNotePopover"
import { TopicPostInfoButton } from "@/components/topicPost/TopicPostInfo"
import {
	DASHED_ROW_CLASS,
	EXPANDER_CARET_CLASS,
	NEWS_HEADING_ROW_CLASS,
	RANK_SLOT_CLASS,
	RESOURCE_LIST_CARD_CLASS,
	SKELETON_SHAPE_CLASS,
} from "@/lib/styleClasses"
import { captureVisitEvent } from "@/lib/visitAnalytics"

// the icon of each kind of row, which shows where a row has no image
const NEWS_EVENT_ICONS: Record<NewsEventKind, LucideIcon> = {
	podcastEpisode: Mic,
	topicPost: PenLine,
	comment: MessageCircle,
	reaction: Heart,
	finding: FileText,
}

/**
 * The browser elements the shared list composes, which the MCP view keeps too. A row is the search results' row, and
 * the page buttons are the search results' own.
 */
export const NEWS_LIST_ELEMENTS: NewsListElements = {
	Card: ({ children }) => <section className={cn(RESOURCE_LIST_CARD_CLASS, "p-5")}>{children}</section>,
	Heading: ({ picker, isExpanded, onToggle, children }) => (
		// biome-ignore lint/a11y/useKeyWithClickEvents: the title's button is the keyboard path
		// biome-ignore lint/a11y/noStaticElementInteractions: a pointer shortcut to that button
		<div onClick={onToggle} className={cn(NEWS_HEADING_ROW_CLASS, "cursor-pointer", isExpanded && "mb-4")}>
			{/* the title and its cup at the size of a section's title, behind the caret a card section opens and closes
			    with */}
			<h2 className="font-display text-xl">
				<button
					type="button"
					aria-expanded={isExpanded}
					onClick={(event) => {
						event.stopPropagation()
						onToggle()
					}}
					className="flex items-center gap-2 text-left"
				>
					<ChevronRight className={cn(EXPANDER_CARET_CLASS, isExpanded && "rotate-90")} />
					<Coffee className="size-5 shrink-0" />
					{children}
				</button>
			</h2>
			{picker}
		</div>
	),
	Opener: ({ children }) => <p className="font-display antialiased leading-relaxed tracking-wide mb-4">{children}</p>,
	WindowPicker: ({ label, children }) => (
		// a window's press chooses the window, which opens a closed list, and never closes an open one
		// biome-ignore lint/a11y/useSemanticElements: a fieldset draws its own border and legend, and the group only names its three buttons
		// biome-ignore lint/a11y/useKeyWithClickEvents: the click only stops the heading's press, and the buttons take the keys
		<div
			role="group"
			aria-label={label}
			onClick={(event) => event.stopPropagation()}
			className="flex shrink-0 items-center gap-1"
		>
			{children}
		</div>
	),
	WindowOption: ({ isSelected, onSelect, children }) => (
		<Button variant={isSelected ? "secondary" : "ghost"} size="sm" aria-pressed={isSelected} onClick={onSelect}>
			{children}
		</Button>
	),
	// the rows run past the card's padding, so their hover reaches the same inset as the search results'
	List: ({ children }) => <div className="-mx-3">{children}</div>,
	Row: NewsEventRow,
	Notice: ({ onRetry, children }) => (
		<div className="space-y-3">
			<p className="text-muted-foreground text-sm">{children}</p>
			{onRetry && (
				<Button variant="outline" onClick={onRetry}>
					Try again
				</Button>
			)}
		</div>
	),
	Loading: NewsRowsSkeleton,
	Pagination: ({ label, pageNumber, pageCount, onOpenPage }) => (
		<Pagination
			ariaLabel={label}
			className="pt-3"
			pageNumber={pageNumber}
			pageCount={pageCount}
			onOpenPage={onOpenPage}
		/>
	),
}

/**
 * The news of the signed-in home or of a profile on the web: the window picker, the search results' numbered rows, and
 * the page buttons under them.
 */
export function NewsList(props: Omit<ComponentProps<typeof SharedNewsList>, "elements" | "captureVisitEvent">) {
	return <SharedNewsList {...props} captureVisitEvent={captureVisitEvent} elements={NEWS_LIST_ELEMENTS} />
}

/**
 * One row of the news: its title and its image open what the row is about, and a click anywhere else on it opens its
 * note. A published Topic Post's row opens the post's info popup under the notebook and pen, and every other row its
 * Topic's note, unless the row offers none, as in an MCP view, which reads no Topic. A Podcast Episode's row with a
 * film has the Video pill beside its play pill.
 */
export function NewsEventRow({
	newsEvent,
	rank,
	text,
	detailsTexts,
	podcastEpisode,
	videoButton,
	isTopicNoteOffered = true,
	topicPostInfoElements,
}: NewsListRowProps & {
	isTopicNoteOffered?: boolean
	// the elements an MCP view replaces in a Topic Post's info popup
	topicPostInfoElements?: Partial<TopicPostInfoElements>
}) {
	const [isNoteOpen, setIsNoteOpen] = useState(false)

	// a published Topic Post's row opens that post's popup. a Podcast Episode's row plays its episode from its pill and
	// opens no note
	const topicPostId = newsEvent.kind === "topicPost" ? newsEvent.topicPostId : null
	const hasTopicNote = isTopicNoteOffered && !topicPostId && newsEvent.kind !== "podcastEpisode"
	return (
		<SearchResultRow
			rank={rank}
			onPress={topicPostId || hasTopicNote ? () => setIsNoteOpen(true) : undefined}
			title={
				<AnchorLink
					href={newsEvent.path}
					className="text-foreground line-clamp-2 max-w-full text-left text-sm font-semibold whitespace-normal hover:underline"
				>
					{text}
				</AnchorLink>
			}
			details={
				<>
					<NewsEventImage newsEvent={newsEvent} />
					<DotSeparatedTexts texts={detailsTexts} />
					{/* a Podcast Episode's Topic, linked as its search result links it */}
					{newsEvent.kind === "podcastEpisode" && (
						<SearchRowTopicDetail topic={{ id: newsEvent.topicId, name: newsEvent.topicName }} />
					)}
					{/* a Podcast Episode's Video pill if it has a film, then its play pill, which wraps first */}
					{newsEvent.kind === "podcastEpisode" && podcastEpisode && videoButton && (
						<PodcastEpisodeVideoButton {...videoButton} />
					)}
					{newsEvent.kind === "podcastEpisode" && podcastEpisode && (
						<PodcastEpisodeNumberPill podcastEpisode={podcastEpisode} />
					)}
					{/* the pill of the chapter that narrates a Finding */}
					{newsEvent.findingId && newsEvent.kind === "finding" && (
						<FindingChapterPill podcastEpisode={podcastEpisode} findingId={newsEvent.findingId} />
					)}
				</>
			}
			titleAside={
				topicPostId ? (
					<TopicPostInfoButton
						topicPostId={topicPostId}
						title={toTopicPostTitle({ title: newsEvent.title ?? "" })}
						isOpen={isNoteOpen}
						onOpenChange={setIsNoteOpen}
						elements={topicPostInfoElements}
					/>
				) : (
					hasTopicNote && (
						<TopicNotePopover topicId={newsEvent.topicId} isOpen={isNoteOpen} onOpenChange={setIsNoteOpen} />
					)
				)
			}
		/>
	)
}

// a row's image where a search result's goes: its Podcast Episode's, its published Topic Post's, or its Topic's
// thumbnail, which opens what the title opens, or its kind's icon
function NewsEventImage({ newsEvent }: { newsEvent: NewsEvent }) {
	if (newsEvent.image) {
		return <TopicImageLink image={newsEvent.image} size="thumbnail" name={newsEvent.topicName} path={newsEvent.path} />
	}
	const NewsEventIcon = NEWS_EVENT_ICONS[newsEvent.kind]
	return <NewsEventIcon className="size-[18px] shrink-0" aria-hidden />
}

// one placeholder row for each row of a page of the news
const NEWS_ROW_KEYS = Array.from({ length: NEWS_PAGE_SIZE }, (_, i) => `row-${i}`)

// the loading state of a page of the news: a full page of rows in the list's own inset, each with the rank slot, the
// title, and the thumbnail beside the details line, so nothing under the card moves when the rows arrive
function NewsRowsSkeleton() {
	return (
		<div aria-hidden="true" className="-mx-3">
			{NEWS_ROW_KEYS.map((rowKey) => (
				<div key={rowKey} className={cn(DASHED_ROW_CLASS, "flex")}>
					{/* the rank slot the real row keeps for its number */}
					<div className={RANK_SLOT_CLASS}>
						<div className={cn(SKELETON_SHAPE_CLASS, "size-3")} />
					</div>
					<div className="min-w-0 flex-1 py-3 pr-3 pl-9">
						{/* the title, on two lines on a phone */}
						<div className="flex h-10 items-center sm:h-5">
							<div className={cn(SKELETON_SHAPE_CLASS, "h-4 w-3/4")} />
						</div>
						{/* the thumbnail and the details line, which wraps under the thumbnail on a phone */}
						<div className="mt-0.5 flex h-[54px] items-start gap-1.5 sm:h-8 sm:items-center">
							<div className={cn(SKELETON_SHAPE_CLASS, "h-8 w-12 shrink-0 rounded-xs")} />
							<div className={cn(SKELETON_SHAPE_CLASS, "h-3 w-2/5")} />
						</div>
					</div>
				</div>
			))}
		</div>
	)
}
