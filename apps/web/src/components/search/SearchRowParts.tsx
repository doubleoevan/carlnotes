// the parts of a search result that the search page's list and the MCP view's table share
import { isPublishedPodcastEpisode, type PodcastEpisodeSummary } from "@carlnotes/contracts/podcast"
import type { FindingSearchRow, SearchRow } from "@carlnotes/contracts/search"
import { toTopicPath } from "@carlnotes/contracts/seo"
import { toDotSeparatedText } from "@carlnotes/contracts/text"
import type { TopicImageUrls } from "@carlnotes/contracts/topicImages"
import { toAgoLabel, toCountLabel } from "@carlnotes/core/lib/labels"
import type { LucideIcon } from "lucide-react"
import { TeamAvatar } from "@/components/branding/TeamAvatar"
import { UserAvatar } from "@/components/branding/UserAvatar"
import { AnchorLink } from "@/components/common/AnchorLink"
import { PodcastEpisodeNumberPill } from "@/components/podcast/PodcastEpisodePill"
import { TopicImageLink } from "@/components/topic/TopicImageLink"
import { SEARCH_RESULT_KIND_ICON } from "./searchFilterOptions"
import { TopicSearchResultDetails } from "./TopicSearchResultDetails"

/**
 * A row that links to its own page: every kind but a finding, whose row opens its note like the feed's.
 */
export type LinkedSearchRow = Exclude<SearchRow, FindingSearchRow>

// a row's icon on its line, at the size of a finding's favicon
const SEARCH_ROW_ICON_CLASS = "size-[18px] shrink-0"

/**
 * A row's line: its icon where a finding's favicon goes, then its details.
 */
export function SearchRowLine({ searchRow }: { searchRow: LinkedSearchRow }) {
	return (
		<>
			<SearchRowIcon searchRow={searchRow} />
			<SearchRowDetails searchRow={searchRow} />
		</>
	)
}

// a row's icon: a topic's, a podcast episode's, or a Topic Post's image, its kind's icon, or a team's or profile's avatar
function SearchRowIcon({ searchRow }: { searchRow: LinkedSearchRow }) {
	switch (searchRow.kind) {
		case "topic":
			return (
				<SearchRowImage
					searchRow={searchRow}
					image={searchRow.topic.image}
					Icon={SEARCH_RESULT_KIND_ICON.topics}
					label="Topic"
				/>
			)
		case "podcastEpisode":
			return (
				<SearchRowImage
					searchRow={searchRow}
					image={searchRow.podcastEpisode.image}
					Icon={SEARCH_RESULT_KIND_ICON.podcastEpisodes}
					label="Podcast episode"
				/>
			)
		// a Topic Post's own image, or its topic's until its own is drawn
		case "topicPost":
			return (
				<SearchRowImage
					searchRow={searchRow}
					image={searchRow.topicPost.image}
					Icon={SEARCH_RESULT_KIND_ICON.topicPosts}
					label="Post"
				/>
			)
		case "team":
			return <TeamAvatar team={searchRow.team} className={SEARCH_ROW_ICON_CLASS} />
		case "user":
			return (
				<UserAvatar
					userId={searchRow.user.userId}
					username={searchRow.user.username}
					avatarVersion={searchRow.user.avatarVersion}
					className={SEARCH_ROW_ICON_CLASS}
				/>
			)
	}
}

// a row's image, which opens the row's page as its title does, or its kind's icon for a row with no image
function SearchRowImage({
	searchRow,
	image,
	Icon,
	label,
}: {
	searchRow: LinkedSearchRow
	image: TopicImageUrls | null
	Icon: LucideIcon
	label: string
}) {
	return image ? (
		<TopicImageLink image={image} size="thumbnail" name={searchRow.name} path={searchRow.path} />
	) : (
		<KindIcon Icon={Icon} label={label} />
	)
}

// a row's details: its kind, its age, its count, the topic it is in, and a podcast episode's play pill
function SearchRowDetails({ searchRow }: { searchRow: LinkedSearchRow }) {
	switch (searchRow.kind) {
		// a topic, its viewers and followers, and its latest podcast episode's pill
		case "topic":
			return (
				<TopicSearchResultDetails
					viewerCount={searchRow.count ?? 0}
					subscriberCount={searchRow.subscriberCount}
					latestPodcastEpisode={searchRow.topic.latestPodcastEpisode}
				/>
			)
		// a podcast episode, how long ago it was published, its listeners, the topic it is in, and its pill
		case "podcastEpisode":
			return (
				<>
					{toDotSeparatedText(["Podcast", toAgoLabel(searchRow.date), toCountLabel(searchRow.count ?? 0, "listener")])}
					<SearchRowTopicDetail topic={searchRow.topic} />
					<PodcastEpisodePill podcastEpisode={searchRow.podcastEpisode} />
				</>
			)
		// a Topic Post, how long ago it was published, and the topic it is in
		case "topicPost":
			return (
				<>
					{toDotSeparatedText(["Post", toAgoLabel(searchRow.date)])}
					<SearchRowTopicDetail topic={searchRow.topic} />
				</>
			)
		// a team, how many topics it holds, and how many members it has
		case "team":
			return (
				<>
					{toDotSeparatedText([
						"Team",
						toCountLabel(searchRow.topicCount, "topic"),
						toCountLabel(searchRow.memberCount, "member"),
					])}
				</>
			)
		// a profile names its kind alone
		case "user":
			return <>Café</>
	}
}

// the topic a podcast episode, a Topic Post, or a finding is in, linked to its page
export function SearchRowTopicLink({ topic }: { topic: { id: string; name: string } }) {
	return (
		<AnchorLink href={toTopicPath(topic)} className="hover:text-foreground underline-offset-2 hover:underline">
			{topic.name}
		</AnchorLink>
	)
}

/**
 * The topic a row is in, after a dot. The dot stays with the topic's name if the line wraps, and the margin evens the
 * line's gap with a space.
 */
export function SearchRowTopicDetail({ topic }: { topic: { id: string; name: string } }) {
	return (
		<span className="-ml-0.5">
			· <SearchRowTopicLink topic={topic} />
		</span>
	)
}

// a published podcast episode's play pill, or nothing for none
function PodcastEpisodePill({ podcastEpisode }: { podcastEpisode: PodcastEpisodeSummary | null }) {
	if (!podcastEpisode || !isPublishedPodcastEpisode(podcastEpisode)) {
		return null
	}
	return <PodcastEpisodeNumberPill podcastEpisode={podcastEpisode} />
}

// a kind's icon, named for a screen reader
function KindIcon({ Icon, label }: { Icon: LucideIcon; label: string }) {
	return <Icon className={SEARCH_ROW_ICON_CLASS} aria-label={label} />
}
