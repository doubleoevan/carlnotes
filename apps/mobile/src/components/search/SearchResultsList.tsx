import { toAvatarImagePath } from "@carlnotes/contracts/avatars"
import type { FindingSearchRow, SearchResultsPage, SearchRow } from "@carlnotes/contracts/search"
import { SITE_URL } from "@carlnotes/contracts/site"
import { toDotSeparatedText } from "@carlnotes/contracts/text"
import type { TopicFindingActions } from "@carlnotes/core/hooks/useTopicFindingActions"
import { toAgoLabel, toCountLabel } from "@carlnotes/core/lib/labels"
import { applySearchFindingChanges } from "@carlnotes/core/lib/topicFindingChanges"
import { cn } from "@carlnotes/nightshift/classNames"
import { Coffee, Mic } from "lucide-react-native"
import { Avatar } from "@/components/branding/Avatar"
import { AnchorLink } from "@/components/common/AnchorLink"
import { PodcastEpisodeNumberPill } from "@/components/podcast/PodcastEpisodePill"
import { toTouchTargetHitSlop } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"
import { Text } from "@/components/primitives/text"
import { TopicImage } from "@/components/primitives/topic-image"
import { TopicFindingListCard } from "@/components/topic/TopicFindingList"
import { TopicResource } from "@/components/topic/TopicResource"
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
							<TopicLink topic={searchRow.topic} />
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
	const href =
		searchRow.kind === "topic"
			? { pathname: "/topics/[topicId]" as const, params: { topicId: searchRow.topic.id } }
			: `${SITE_URL}${searchRow.path}`
	return (
		<SearchResultRow
			rank={rank}
			className={cn(!isLast && "border-b border-dashed border-separator-strong")}
			title={
				<AnchorLink href={href} accessibilityLabel={`Open ${searchRow.name}`} hitSlop={toTouchTargetHitSlop(20)}>
					<Text numberOfLines={1} className="text-sm font-semibold text-card-foreground">
						{searchRow.name}
					</Text>
				</AnchorLink>
			}
			details={<SearchRowLine searchRow={searchRow} />}
		/>
	)
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
	if (searchRow.kind === "topic" && searchRow.topic.image) {
		return (
			<TopicImage image={searchRow.topic.image} size="thumbnail" name={searchRow.topic.name} className="shrink-0" />
		)
	}
	if (searchRow.kind === "podcastEpisode" && searchRow.podcastEpisode.image) {
		return (
			<TopicImage image={searchRow.podcastEpisode.image} size="thumbnail" name={searchRow.name} className="shrink-0" />
		)
	}
	return <Icon as={searchRow.kind === "topic" ? Coffee : Mic} className="size-4 text-muted-foreground" />
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
					<TopicLink topic={searchRow.topic} />
					<PodcastEpisodeNumberPill podcastEpisode={searchRow.podcastEpisode} />
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
			return <Text className="text-xs text-muted-foreground">Profile</Text>
	}
}

// let attribution open its Topic without opening the surrounding finding sheet
function TopicLink({ topic }: { topic: { id: string; name: string } }) {
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
