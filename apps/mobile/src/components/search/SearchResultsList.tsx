import { toAvatarImagePath } from "@carlnotes/contracts/avatars"
import type { FindingSearchRow, SearchResultsPage, SearchRow } from "@carlnotes/contracts/search"
import { toDotSeparatedText } from "@carlnotes/contracts/text"
import type { TopicFindingActions } from "@carlnotes/core/hooks/useTopicFindingActions"
import { toAgoLabel, toCountLabel } from "@carlnotes/core/lib/labels"
import { SITE_URL } from "@carlnotes/core/lib/pageHead"
import { applySearchFindingChanges } from "@carlnotes/core/lib/topicFindingChanges"
import { cn } from "@carlnotes/nightshift/classNames"
import { Hash, Podcast } from "lucide-react-native"
import { View } from "react-native"
import { Avatar } from "@/components/branding/Avatar"
import { AnchorLink } from "@/components/common/AnchorLink"
import { PodcastEpisodeNumberPill } from "@/components/podcast/PodcastEpisodePill"
import { toTouchTargetHitSlop } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"
import { Text } from "@/components/primitives/text"
import { TopicFindingListCard } from "@/components/topic/TopicFindingList"
import { TopicResource } from "@/components/topic/TopicResource"
import { useFontScaledSize } from "@/hooks/useFontScaledSize"

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
				page.rows.map((row, index) => {
					// carry only search-specific metadata into the existing feed row
					const rank = (page.page - 1) * page.pageSize + index + 1
					const isLast = page === lastPage && index === page.rows.length - 1
					return row.kind === "finding" ? (
						<TopicResource
							key={`${row.kind}:${row.id}`}
							resource={row.finding}
							topic={row.topic}
							topicFindingRank={rank}
							isBookmarkOnLine
							isLast={isLast}
							latestPodcastEpisode={page.podcastEpisodes.find((episode) => episode.topicId === row.topic.id)}
							topicFeedHandlers={state.handlers}
							isPending={state.pendingChanges.some((change) => change.findingId === row.finding.findingId)}
						>
							<TopicLink topic={row.topic} prefix="in " />
						</TopicResource>
					) : (
						<SearchResultRow key={`${row.kind}:${row.id}`} row={row} rank={rank} isLast={isLast} />
					)
				}),
			)}
		</TopicFindingListCard>
	)
}

// keep mixed results on the same rank and icon columns as the finding summary
function SearchResultRow({ row, rank, isLast }: { row: LinkedSearchRow; rank: number; isLast: boolean }) {
	// route Topics directly and let AnchorLink normalize Team and Profile destinations
	const rankWidth = useFontScaledSize(16)
	const href =
		row.kind === "topic"
			? { pathname: "/topics/[topicId]" as const, params: { topicId: row.topic.id } }
			: `${SITE_URL}${row.path}`
	return (
		<View
			className={cn(
				"min-h-16 flex-row items-start gap-2.5 py-3",
				!isLast && "border-b border-dashed border-separator-strong",
			)}
		>
			<Text style={{ width: rankWidth }} className="pt-0.5 text-center font-display text-sm text-muted-foreground">
				{rank}
			</Text>
			<SearchRowIcon row={row} />
			<View className="min-w-0 flex-1 gap-0.5">
				{/* the linked title keeps the web's foreground and weight */}
				<AnchorLink href={href} accessibilityLabel={`Open ${row.name}`} hitSlop={toTouchTargetHitSlop(20)}>
					<Text numberOfLines={1} className="text-sm font-semibold text-card-foreground">
						{row.name}
					</Text>
				</AnchorLink>
				<View className="flex-row flex-wrap items-center gap-1.5">
					<SearchRowLine row={row} />
				</View>
			</View>
		</View>
	)
}

// reuse the app's avatar fallback and the web's kind icons
function SearchRowIcon({ row }: { row: LinkedSearchRow }) {
	if (row.kind === "team") {
		return (
			<Avatar
				size={16}
				ownerId={row.team.teamId}
				name={row.team.name}
				imageUrl={row.team.avatarVersion ? `/api/team-avatars/${row.team.teamId}?v=${row.team.avatarVersion}` : null}
			/>
		)
	}
	if (row.kind === "user") {
		return (
			<Avatar
				size={16}
				ownerId={row.user.userId}
				name={row.user.username}
				imageUrl={row.user.avatarVersion ? toAvatarImagePath(row.user.userId, row.user.avatarVersion) : null}
			/>
		)
	}
	return <Icon as={row.kind === "topic" ? Hash : Podcast} className="mt-0.5 size-4 text-muted-foreground" />
}

// match each kind's web metadata and reuse the same episode pill as findings
function SearchRowLine({ row }: { row: LinkedSearchRow }) {
	switch (row.kind) {
		case "topic":
			return (
				<>
					<Text className="text-xs text-muted-foreground">
						{toDotSeparatedText([
							"Topic",
							toCountLabel(row.count ?? 0, "viewer"),
							toCountLabel(row.subscriberCount, "follower"),
						])}
					</Text>
					<PodcastEpisodeNumberPill podcastEpisode={row.topic.latestPodcastEpisode} />
				</>
			)
		case "podcastEpisode":
			return (
				<>
					<TopicLink topic={row.topic} prefix="Podcast in " />
					<Text className="text-xs text-muted-foreground">{`· ${toDotSeparatedText([toAgoLabel(row.date), toCountLabel(row.count ?? 0, "listener")])}`}</Text>
					<PodcastEpisodeNumberPill podcastEpisode={row.podcastEpisode} />
				</>
			)
		case "team":
			return (
				<Text className="text-xs text-muted-foreground">
					{toDotSeparatedText(["Team", toCountLabel(row.topicCount, "topic"), toCountLabel(row.memberCount, "member")])}
				</Text>
			)
		case "user":
			return <Text className="text-xs text-muted-foreground">Profile</Text>
	}
}

// let attribution open its Topic without opening the surrounding finding sheet
function TopicLink({ topic, prefix }: { topic: { id: string; name: string }; prefix: string }) {
	return (
		<AnchorLink
			href={{ pathname: "/topics/[topicId]", params: { topicId: topic.id } }}
			accessibilityLabel={`Open topic ${topic.name}`}
			onPress={(event) => event.stopPropagation()}
			hitSlop={toTouchTargetHitSlop(20)}
			className="self-start py-0.5"
		>
			<Text className="text-xs text-muted-foreground">
				{prefix}
				{topic.name}
			</Text>
		</AnchorLink>
	)
}
