import { toAvatarImagePath } from "@carlnotes/contracts/avatars"
import type { PodcastEpisodeSummary } from "@carlnotes/contracts/podcast"
import type { FindingSearchRow, SearchResultsPage, SearchRow } from "@carlnotes/contracts/search"
import { SITE_URL } from "@carlnotes/contracts/site"
import { toDotSeparatedText } from "@carlnotes/contracts/text"
import type { TopicImageUrls } from "@carlnotes/contracts/topicImages"
import type { TopicFindingActions } from "@carlnotes/core/hooks/useTopicFindingActions"
import { toAgoLabel, toCountLabel } from "@carlnotes/core/lib/labels"
import { applySearchFindingChanges } from "@carlnotes/core/lib/topicFindingChanges"
import { toPodcastEpisodeVideoPill } from "@carlnotes/core/lib/topicPodcastEpisodeVideoDisplay"
import { cn } from "@carlnotes/nightshift/classNames"
import { Coffee, type LucideIcon, Mic, NotebookPen } from "lucide-react-native"
import { type ComponentProps, type ReactNode, useState } from "react"
import { View } from "react-native"
import { Avatar } from "@/components/branding/Avatar"
import { AnchorLink } from "@/components/common/AnchorLink"
import { PodcastEpisodeNumberPill } from "@/components/podcast/PodcastEpisodePill"
import { PodcastEpisodeVideoButton } from "@/components/podcast/PodcastEpisodeVideoButton"
import { toTouchTargetHitSlop } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"
import { Text } from "@/components/primitives/text"
import { TopicFindingListCard } from "@/components/topic/TopicFindingList"
import { TopicImageLink } from "@/components/topic/TopicImageLink"
import { TopicNotePopover } from "@/components/topic/TopicNotePopover"
import { TopicResource } from "@/components/topic/TopicResource"
import { TopicPostInfo } from "@/components/topicPost/TopicPostInfo"
import { SearchResultRow } from "./SearchResultRow"
import { TopicSearchResultDetails } from "./TopicSearchResultDetails"

// findings share the feed's row. every other result links to its own page
type LinkedSearchRow = Exclude<SearchRow, FindingSearchRow>

/**
 * Lists mixed search results in the feed's card with the web's ranks, metadata, and finding sheets.
 */
export function SearchResultsList({ pages, state }: { pages: SearchResultsPage[]; state: TopicFindingActions }) {
	// preserve ranks across appended pages and show pending changes from the shared finding actions
	const searchPages = pages.map((page) => applySearchFindingChanges(page, state.pendingChanges))
	const lastPage = searchPages.at(-1)
	return (
		<TopicFindingListCard>
			{searchPages.flatMap((page) =>
				page.rows.map((searchRow, index) => {
					// carry only search-specific metadata into the existing feed row
					const rank = (page.page - 1) * page.pageSize + index + 1
					const isLast = page === lastPage && index === page.rows.length - 1
					return searchRow.kind === "finding" ? (
						<TopicResource
							key={`${searchRow.kind}:${searchRow.id}`}
							resource={searchRow.finding}
							topic={searchRow.topic}
							topicFindingRank={rank}
							isBookmarkOnLine
							isLast={isLast}
							latestPodcastEpisode={page.podcastEpisodes.find((episode) => episode.topicId === searchRow.topic.id)}
							topicFeedHandlers={state.handlers}
							isPending={state.pendingChanges.some((change) => change.findingId === searchRow.finding.findingId)}
						>
							<SearchRowTopicLink topic={searchRow.topic} />
						</TopicResource>
					) : (
						<LinkedSearchResultRow
							key={`${searchRow.kind}:${searchRow.id}`}
							searchRow={searchRow}
							rank={rank}
							isLast={isLast}
						/>
					)
				}),
			)}
		</TopicFindingListCard>
	)
}

// preserve native navigation, touch targets, and separators inside the shared row
function LinkedSearchResultRow({
	searchRow,
	rank,
	isLast,
}: {
	searchRow: LinkedSearchRow
	rank: number
	isLast: boolean
}) {
	// a tap on a topic's row, anywhere but its title and its image, opens the topic's note, and one on a Topic Post's
	// row opens the post's popup
	const [isPopupOpen, setIsPopupOpen] = useState(false)
	const hasPopup = searchRow.kind === "topic" || searchRow.kind === "topicPost"
	return (
		<SearchResultRow
			rank={rank}
			className={cn(!isLast && "border-b border-dashed border-separator-strong")}
			onPress={hasPopup ? () => setIsPopupOpen(true) : undefined}
			titleAside={toSearchRowTitleAside(searchRow, { isOpen: isPopupOpen, onOpenChange: setIsPopupOpen })}
			title={
				<AnchorLink
					href={toSearchRowHref(searchRow)}
					accessibilityLabel={`Open ${searchRow.name}`}
					hitSlop={toTouchTargetHitSlop(20)}
				>
					<Text numberOfLines={1} className="text-sm font-semibold text-card-foreground">
						{searchRow.name}
					</Text>
				</AnchorLink>
			}
			details={<SearchRowLine searchRow={searchRow} />}
		/>
	)
}

// a row's page: a topic's screen, and for every other kind its site url, which the link opens in the app if the app
// has that screen
function toSearchRowHref(searchRow: LinkedSearchRow): ComponentProps<typeof AnchorLink>["href"] {
	return searchRow.kind === "topic"
		? { pathname: "/topics/[topicId]", params: { topicId: searchRow.topic.id } }
		: `${SITE_URL}${searchRow.path}`
}

// the control right after a row's title: the button that opens a topic's note, the one that opens a Topic Post's
// popup, and none on every other kind
function toSearchRowTitleAside(
	searchRow: LinkedSearchRow,
	popup: { isOpen: boolean; onOpenChange: (isOpen: boolean) => void },
): ReactNode {
	switch (searchRow.kind) {
		case "topic":
			return <TopicNotePopover topicId={searchRow.topic.id} isOpen={popup.isOpen} onOpenChange={popup.onOpenChange} />
		case "topicPost":
			return (
				<TopicPostInfo
					topicPostId={searchRow.id}
					title={searchRow.name}
					isOpen={popup.isOpen}
					onOpenChange={popup.onOpenChange}
				/>
			)
		default:
			return null
	}
}

// a row's line: its icon where a finding's favicon goes, then its details
function SearchRowLine({ searchRow }: { searchRow: LinkedSearchRow }) {
	return (
		<>
			<SearchRowIcon searchRow={searchRow} />
			<SearchRowDetails searchRow={searchRow} />
		</>
	)
}

// reuse the app's avatar fallback and the web's kind icons
function SearchRowIcon({ searchRow }: { searchRow: LinkedSearchRow }) {
	if (searchRow.kind === "team") {
		return (
			<Avatar
				size={16}
				ownerId={searchRow.team.teamId}
				name={searchRow.team.name}
				imageUrl={
					searchRow.team.avatarVersion
						? `/api/team-avatars/${searchRow.team.teamId}?v=${searchRow.team.avatarVersion}`
						: null
				}
			/>
		)
	}
	if (searchRow.kind === "user") {
		return (
			<Avatar
				size={16}
				ownerId={searchRow.user.userId}
				name={searchRow.user.username}
				imageUrl={
					searchRow.user.avatarVersion ? toAvatarImagePath(searchRow.user.userId, searchRow.user.avatarVersion) : null
				}
			/>
		)
	}
	// a topic's image, a podcast episode's own, and a Topic Post's own or its topic's until its own is drawn
	if (searchRow.kind === "topic") {
		return <SearchRowImage searchRow={searchRow} image={searchRow.topic.image} KindIcon={Coffee} />
	}
	if (searchRow.kind === "podcastEpisode") {
		return <SearchRowImage searchRow={searchRow} image={searchRow.podcastEpisode.image} KindIcon={Mic} />
	}
	return <SearchRowImage searchRow={searchRow} image={searchRow.topicPost.image} KindIcon={NotebookPen} />
}

// a row's image, which opens the row's page as its title does, or its kind's icon for a row with no image
function SearchRowImage({
	searchRow,
	image,
	KindIcon,
}: {
	searchRow: LinkedSearchRow
	image: TopicImageUrls | null
	KindIcon: LucideIcon
}) {
	if (!image) {
		return <Icon as={KindIcon} className="size-4 text-muted-foreground" />
	}
	return <TopicImageLink image={image} size="thumbnail" name={searchRow.name} path={searchRow.path} />
}

// match each kind's web metadata and reuse the same episode pill as findings
function SearchRowDetails({ searchRow }: { searchRow: LinkedSearchRow }) {
	switch (searchRow.kind) {
		case "topic":
			return (
				<TopicSearchResultDetails
					viewerCount={searchRow.count ?? 0}
					subscriberCount={searchRow.subscriberCount}
					latestPodcastEpisode={searchRow.topic.latestPodcastEpisode}
				/>
			)
		case "podcastEpisode":
			return (
				<>
					<Text className="text-xs text-muted-foreground">
						{toDotSeparatedText([
							"Podcast",
							toAgoLabel(searchRow.date),
							toCountLabel(searchRow.count ?? 0, "listener"),
						])}
					</Text>
					<SearchRowTopicLink topic={searchRow.topic} />
					<PodcastEpisodePills podcastEpisode={searchRow.podcastEpisode} />
				</>
			)
		case "topicPost":
			return (
				<>
					<Text className="text-xs text-muted-foreground">
						{toDotSeparatedText(["Post", toAgoLabel(searchRow.date)])}
					</Text>
					<SearchRowTopicLink topic={searchRow.topic} />
				</>
			)
		case "team":
			return (
				<Text className="text-xs text-muted-foreground">
					{toDotSeparatedText([
						"Team",
						toCountLabel(searchRow.topicCount, "topic"),
						toCountLabel(searchRow.memberCount, "member"),
					])}
				</Text>
			)
		case "user":
			return <Text className="text-xs text-muted-foreground">Café</Text>
	}
}

// a podcast episode's play pill, with its film's Video pill before it, as on a news row. the two wrap together
function PodcastEpisodePills({ podcastEpisode }: { podcastEpisode: PodcastEpisodeSummary }) {
	const videoPill = toPodcastEpisodeVideoPill(podcastEpisode, "search")
	return (
		<View className="flex-row items-center gap-1.5">
			{videoPill && <PodcastEpisodeVideoButton {...videoPill} />}
			<PodcastEpisodeNumberPill podcastEpisode={podcastEpisode} />
		</View>
	)
}

// let attribution open its Topic without opening the surrounding finding sheet
export function SearchRowTopicLink({ topic }: { topic: { id: string; name: string } }) {
	return (
		<AnchorLink
			href={{ pathname: "/topics/[topicId]", params: { topicId: topic.id } }}
			accessibilityLabel={`Open topic ${topic.name}`}
			onPress={(event) => event.stopPropagation()}
			hitSlop={toTouchTargetHitSlop(20)}
			className="-ml-0.5 py-0.5"
		>
			{/* the dot stays with the topic's name when the line wraps, and the margin evens the line's gap with a space */}
			<Text className="text-xs text-muted-foreground">
				{"· "}
				{topic.name}
			</Text>
		</AnchorLink>
	)
}
