import { NEWS_PAGE_SIZE, type NewsEvent, type NewsEventKind } from "@carlnotes/contracts/news"
import {
	type NewsListElements,
	type NewsListRowProps,
	NewsList as SharedNewsList,
} from "@carlnotes/core/components/NewsList"
import { toTopicPostTitle } from "@carlnotes/core/lib/topicPosts"
import { cn } from "@carlnotes/nightshift/classNames"
import {
	ChevronDown,
	ChevronRight,
	Coffee,
	FileText,
	Heart,
	type LucideIcon,
	MessageCircle,
	Mic,
	PenLine,
} from "lucide-react-native"
import { type ComponentProps, useState } from "react"
import { Pressable, View } from "react-native"
import { AnchorLink } from "@/components/common/AnchorLink"
import { Pagination } from "@/components/common/Pagination"
import { SkeletonPulse } from "@/components/common/SkeletonPulse"
import { FindingChapterPill, PodcastEpisodeNumberPill } from "@/components/podcast/PodcastEpisodePill"
import { PodcastEpisodeVideoButton } from "@/components/podcast/PodcastEpisodeVideoButton"
import { Button, toTouchTargetHitSlop } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"
import { Text } from "@/components/primitives/text"
import { SearchResultRow } from "@/components/search/SearchResultRow"
import { SearchRowTopicLink } from "@/components/search/SearchResultsList"
import { TopicImageLink } from "@/components/topic/TopicImageLink"
import { TopicNotePopover } from "@/components/topic/TopicNotePopover"
import { TopicPostInfo } from "@/components/topicPost/TopicPostInfo"
import { NEWS_HEADING_ROW_CLASS, SKELETON_SHAPE_CLASS } from "@/sectionClasses"
import { toTypeRoleStyle } from "@/typeRoleStyles"
import { captureVisitEvent } from "@/visitAnalytics"

// the icon of each kind of row, the web's, which shows where a row has no image
const NEWS_EVENT_ICONS: Record<NewsEventKind, LucideIcon> = {
	podcastEpisode: Mic,
	topicPost: PenLine,
	comment: MessageCircle,
	reaction: Heart,
	finding: FileText,
}

// the app's elements the shared list composes, matching the web's card at phone width. a row is the search results'
// numbered row, and the page buttons are the search results' own
export const NEWS_LIST_ELEMENTS: NewsListElements = {
	Card: ({ children }) => (
		<View className="rounded-lg border border-separator bg-card p-5 shadow-raised">{children}</View>
	),
	Heading: ({ picker, isExpanded, onToggle, children }) => (
		<View className={cn(NEWS_HEADING_ROW_CLASS, isExpanded && "mb-4")}>
			{/* the title and its cup at the size of a card section's title, behind the caret a card section opens and
			    closes with */}
			<Pressable
				accessibilityRole="button"
				accessibilityLabel={String(children)}
				accessibilityState={{ expanded: isExpanded }}
				onPress={onToggle}
				className="min-h-11 shrink flex-row items-center gap-2 active:opacity-75"
			>
				<Icon as={isExpanded ? ChevronDown : ChevronRight} />
				<Icon as={Coffee} className="size-5 text-foreground" />
				<Text style={toTypeRoleStyle("sectionTitle")} className="shrink">
					{children}
				</Text>
			</Pressable>
			{picker}
		</View>
	),
	Opener: ({ children }) => (
		<Text className="mb-4 font-display font-normal leading-relaxed tracking-wide">{children}</Text>
	),
	WindowPicker: ({ label, children }) => (
		<View accessibilityLabel={label} className="flex-row items-center gap-1">
			{children}
		</View>
	),
	WindowOption: ({ isSelected, onSelect, children }) => (
		<Button
			variant={isSelected ? "secondary" : "ghost"}
			size="sm"
			accessibilityLabel={String(children)}
			accessibilityState={{ selected: isSelected }}
			onPress={onSelect}
		>
			<Text>{children}</Text>
		</Button>
	),
	List: ({ children }) => <View>{children}</View>,
	Row: NewsEventRow,
	Notice: ({ onRetry, children }) => (
		<View className="gap-3" accessibilityLiveRegion="polite">
			<Text className="text-sm text-muted-foreground">{children}</Text>
			{onRetry && (
				<Button variant="outline" accessibilityLabel="Retry the news" onPress={onRetry} className="self-start">
					<Text>Try again</Text>
				</Button>
			)}
		</View>
	),
	// the rows pulse on their own. the card around them is already loaded
	Loading: () => (
		<SkeletonPulse>
			<NewsRowsSkeleton />
		</SkeletonPulse>
	),
	Pagination: ({ label, pageNumber, pageCount, onOpenPage }) => (
		<View className="pt-3">
			<Pagination label={label} pageNumber={pageNumber} pageCount={pageCount} onOpenPage={onOpenPage} />
		</View>
	),
}

/**
 * The news of the signed-in home or of a profile in the app: the window picker, the search results' numbered rows, and
 * the page buttons under them.
 */
export function NewsList(props: Omit<ComponentProps<typeof SharedNewsList>, "elements" | "captureVisitEvent">) {
	return <SharedNewsList {...props} captureVisitEvent={captureVisitEvent} elements={NEWS_LIST_ELEMENTS} />
}

// one row: its title and its image open what the row is about, and a tap anywhere else on it opens its note. a
// published Topic Post's row opens the post's info popup under the notebook and pen, and every other row its Topic's
// note. a Podcast Episode's row with a film has the Video pill beside its play pill
function NewsEventRow({
	newsEvent,
	rank,
	text,
	detailsTexts,
	timeLabel,
	isFirst,
	podcastEpisode,
	videoButton,
}: NewsListRowProps) {
	const [isNoteOpen, setIsNoteOpen] = useState(false)

	// a published Topic Post's row opens that post's popup. a Podcast Episode's row plays its episode from its pill and
	// opens no note
	const topicPostId = newsEvent.kind === "topicPost" ? newsEvent.topicPostId : null
	const hasTopicNote = !topicPostId && newsEvent.kind !== "podcastEpisode"
	return (
		<SearchResultRow
			rank={rank}
			className={cn(!isFirst && "border-t border-dashed border-separator-strong")}
			onPress={topicPostId || hasTopicNote ? () => setIsNoteOpen(true) : undefined}
			title={
				<AnchorLink
					href={newsEvent.path}
					accessibilityLabel={`${text}, ${newsEvent.topicName}, ${timeLabel}`}
					hitSlop={toTouchTargetHitSlop(20)}
				>
					<Text numberOfLines={2} className="text-sm font-semibold text-card-foreground">
						{text}
					</Text>
				</AnchorLink>
			}
			details={
				<>
					<NewsEventImage newsEvent={newsEvent} />
					{/* each text wraps on its own, the dot staying with the text after it */}
					{detailsTexts.map((detailText, i) => (
						<Text key={detailText} className={cn("text-xs text-muted-foreground", i === 0 ? "shrink" : "-ml-0.5")}>
							{i > 0 && "· "}
							{detailText}
						</Text>
					))}
					{/* a Podcast Episode's Topic, linked as its search result links it */}
					{newsEvent.kind === "podcastEpisode" && (
						<SearchRowTopicLink topic={{ id: newsEvent.topicId, name: newsEvent.topicName }} />
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
					<TopicPostInfo
						topicPostId={topicPostId}
						title={toTopicPostTitle({ title: newsEvent.title ?? "" })}
						isOpen={isNoteOpen}
						onOpenChange={setIsNoteOpen}
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
	return <Icon as={NEWS_EVENT_ICONS[newsEvent.kind]} className="size-4 text-muted-foreground" />
}

// one placeholder row for each row of a page of the news
const NEWS_ROW_KEYS = Array.from({ length: NEWS_PAGE_SIZE }, (_, i) => `row-${i}`)

// the loading state of a page of the news, matching the web's at phone width: a full page of rows in the search
// results' row, each with the rank, the title on two lines, and the thumbnail beside the details line, so nothing
// under the card moves when the rows arrive
function NewsRowsSkeleton() {
	return (
		<View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
			{NEWS_ROW_KEYS.map((rowKey, i) => (
				<View
					key={rowKey}
					className={cn(
						"min-h-16 flex-row items-start gap-2.5 py-3",
						i > 0 && "border-t border-dashed border-separator-strong",
					)}
				>
					{/* the rank */}
					<View className={cn(SKELETON_SHAPE_CLASS, "mt-1 size-3")} />
					<View className="min-w-0 flex-1 gap-0.5">
						{/* the title, on two lines */}
						<View className="h-10 justify-center">
							<View className={cn(SKELETON_SHAPE_CLASS, "h-4 w-3/4")} />
						</View>
						{/* the thumbnail and the details line, which wraps under the thumbnail */}
						<View className="h-[54px] flex-row items-start gap-1.5">
							<View className={cn(SKELETON_SHAPE_CLASS, "h-8 w-12 rounded-xs")} />
							<View className={cn(SKELETON_SHAPE_CLASS, "h-3 w-2/5")} />
						</View>
					</View>
				</View>
			))}
		</View>
	)
}
