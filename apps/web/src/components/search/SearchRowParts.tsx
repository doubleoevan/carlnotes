// the parts of a search result that the search page's list and the MCP view's table share
import { isPublishedPodcastEpisode, type PodcastEpisodeSummary } from "@carlnotes/contracts/podcast"
import type { FindingSearchRow, SearchRow } from "@carlnotes/contracts/search"
import { toTopicPath } from "@carlnotes/contracts/seo"
import { toCountLabel, toDotSeparatedText } from "@carlnotes/contracts/text"
import type { TopicImageUrls } from "@carlnotes/contracts/topicImages"
import { toAgoLabel } from "@carlnotes/core/lib/labels"
import { toPodcastEpisodeVideoPill } from "@carlnotes/core/lib/topicPodcastEpisodeVideoDisplay"
import type { LucideIcon } from "lucide-react"
import { TeamAvatar } from "@/components/branding/TeamAvatar"
import { UserAvatar } from "@/components/branding/UserAvatar"
import { AnchorLink } from "@/components/common/AnchorLink"
import { PodcastEpisodeNumberPill } from "@/components/podcast/PodcastEpisodePill"
import { PodcastEpisodeVideoButton } from "@/components/podcast/PodcastEpisodeVideoButton"
import { TopicImageLink } from "@/components/topic/TopicImageLink"
import { SEARCH_RESULT_KIND_ICON } from "./searchFilterOptions"
import { TopicSearchResultDetails } from "./TopicSearchResultDetails"

/**
 * A row that links to its own page: every kind but a finding, whose row opens its note like the feed's.
 */
export type LinkedSearchRow = Exclude<SearchRow, FindingSearchRow>

// a row's icon on its line, at the size of a finding's favicon
const SEARCH_ROW_ICON_CLASS = "size-[18px] shrink-0"

// a row, and whether a podcast episode's row shows its film's Video pill, which the MCP view cannot play
type SearchRowLineProps = { searchRow: LinkedSearchRow; isVideoShown?: boolean }

/**
 * A row's line: its icon where a finding's favicon goes, then its details.
 */
export function SearchRowLine({ searchRow, isVideoShown = false }: SearchRowLineProps) {
	return (
		<>
			<SearchRowIcon searchRow={searchRow} />
			<SearchRowDetails searchRow={searchRow} isVideoShown={isVideoShown} />
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

// a row's details: its kind, its age, its count, the topic it is in, and a podcast episode's Video and play pills
function SearchRowDetails({ searchRow, isVideoShown }: Required<SearchRowLineProps>) {
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
		// a podcast episode, how long ago it was published, its listeners, the topic it is in, and its pills
		case "podcastEpisode":
			return (
				<>
					{toDotSeparatedText(["Podcast", toAgoLabel(searchRow.date), toCountLabel(searchRow.count ?? 0, "listener")])}
					<SearchRowTopicDetail topic={searchRow.topic} />
					<PodcastEpisodePills podcastEpisode={searchRow.podcastEpisode} isVideoShown={isVideoShown} />
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

// a published podcast episode's play pill, with its film's Video pill before it, or nothing for none. the two wrap
// together, as on a news row
function PodcastEpisodePills({
	podcastEpisode,
	isVideoShown,
}: {
	podcastEpisode: PodcastEpisodeSummary | null
	isVideoShown: boolean
}) {
	if (!podcastEpisode || !isPublishedPodcastEpisode(podcastEpisode)) {
		return null
	}
	const videoPill = isVideoShown ? toPodcastEpisodeVideoPill(podcastEpisode, "search") : null
	return (
		<span className="inline-flex items-center gap-1.5">
			{videoPill && <PodcastEpisodeVideoButton {...videoPill} />}
			<PodcastEpisodeNumberPill podcastEpisode={podcastEpisode} />
		</span>
	)
}

// a kind's icon, named for a screen reader
function KindIcon({ Icon, label }: { Icon: LucideIcon; label: string }) {
	return <Icon className={SEARCH_ROW_ICON_CLASS} aria-label={label} />
}
