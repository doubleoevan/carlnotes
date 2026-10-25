import {
	isPublishedPodcastEpisode,
	type PodcastEpisode,
	type PodcastEpisodeSummary,
} from "@carlnotes/contracts/podcast"
import type { FindingSearchRow, SearchResultsPage, SearchRow, TopicSearchRow } from "@carlnotes/contracts/search"
import { toTopicPath } from "@carlnotes/contracts/seo"
import { toDotSeparatedText } from "@carlnotes/contracts/text"
import { toAgeLabel, toCountLabel } from "@carlnotes/core/lib/labels"
import { cn } from "@carlnotes/nightshift/classNames"
import type { LucideIcon } from "lucide-react"
import type { ComponentProps, ReactNode } from "react"
import { TeamAvatar } from "@/components/branding/TeamAvatar"
import { UserAvatar } from "@/components/branding/UserAvatar"
import { AnchorLink } from "@/components/common/AnchorLink"
import { Pagination } from "@/components/common/Pagination"
import { PodcastEpisodeNumberPill } from "@/components/podcast/PodcastEpisodePill"
import { ResourceSkeleton } from "@/components/topic/TopicFeedSkeleton"
import { TopicResource } from "@/components/topic/TopicResource"
import { DASHED_ROW_CLASS, LIST_ROW_HOVER_CLASS, RESOURCE_LIST_CARD_CLASS } from "@/lib/styleClasses"
import type { TopicFeedHandlers } from "@/providers/TopicFeedProvider"
import { SEARCH_RESULT_KIND_ICON } from "./searchFilterOptions"

// a row that links to its own page: every kind but a finding, whose row opens its note like the feed's
type LinkedSearchRow = Exclude<SearchRow, FindingSearchRow>

// how the page row opens a page: links the caller renders, or buttons that call it back
type SearchPagination =
	| { renderPageLink: NonNullable<ComponentProps<typeof Pagination>["renderPageLink"]>; onOpenPage?: undefined }
	| { onOpenPage: (pageNumber: number) => void; renderPageLink?: undefined }

/**
 * The site search's results as the feed lists its findings: each row numbered, with its kind's icon, a link to its
 * page, and a line naming its kind, its topic, its age, and its count, with a podcast episode's play pill. A finding's row is
 * the feed's own, whose note opens on a click, with its topic after its age. The numbered page row under the list
 * opens the search's other pages.
 */
export function SearchResultsList({
	searchPage,
	searchPagination,
	loadingPageNumber,
	topicFeedHandlers,
	renderTopicAction,
}: {
	searchPage: SearchResultsPage
	searchPagination: SearchPagination
	// the page on its way, whose rows show as skeletons under the page row that opened it
	loadingPageNumber?: number
	// what a finding's note does on a read, a rating, a bookmark, or an open. the site's feed provider's if left out
	topicFeedHandlers?: TopicFeedHandlers
	// what a topic row shows at its end, such as a card's Follow button
	renderTopicAction?: (topicSearchRow: TopicSearchRow) => ReactNode
}) {
	// the number of the page's first row, counted across every page
	const firstRank = (searchPage.page - 1) * searchPage.pageSize + 1

	// the page the row marks as current, and how many rows the loading page holds
	const pageNumber = loadingPageNumber ?? searchPage.page
	const loadingRowCount = Math.min(searchPage.pageSize, searchPage.rowCount - (pageNumber - 1) * searchPage.pageSize)
	return (
		<>
			{/* the loading page's skeleton rows, or the page's rows, each drawing its own dashed separator */}
			{loadingPageNumber ? (
				<SearchResultsSkeleton rowCount={loadingRowCount} />
			) : (
				<div className={cn(RESOURCE_LIST_CARD_CLASS, "p-1")}>
					{searchPage.rows.map((searchRow, index) =>
						searchRow.kind === "finding" ? (
							<SearchFindingRow
								key={`${searchRow.kind}-${searchRow.id}`}
								findingSearchRow={searchRow}
								rank={firstRank + index}
								latestPodcastEpisode={searchPage.podcastEpisodes.find(
									(podcastEpisode) => podcastEpisode.topicId === searchRow.topic.id,
								)}
								topicFeedHandlers={topicFeedHandlers}
							/>
						) : (
							<SearchResultRow
								key={`${searchRow.kind}-${searchRow.id}`}
								searchRow={searchRow}
								rank={firstRank + index}
								action={searchRow.kind === "topic" ? renderTopicAction?.(searchRow) : null}
							/>
						),
					)}
				</div>
			)}
			{/* the numbered pages, shown once there is more than one. the html holds one page, so its links show without
			    JavaScript too */}
			{searchPage.pageCount > 1 && (
				<SearchPageRow searchPage={searchPage} pageNumber={pageNumber} searchPagination={searchPagination} />
			)}
		</>
	)
}

/**
 * A loading state for the search results: skeleton rows in the list's own card, so nothing shifts when the rows arrive.
 */
export function SearchResultsSkeleton({ rowCount }: { rowCount: number }) {
	return (
		<div aria-hidden="true" className={cn(RESOURCE_LIST_CARD_CLASS, "p-1")}>
			{Array.from({ length: rowCount }, (_, index) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: the skeleton rows are identical and never reorder
				<ResourceSkeleton key={index} />
			))}
		</div>
	)
}

// the numbered pages under the list. the html holds one page, so a row of links shows without JavaScript too
function SearchPageRow({
	searchPage,
	pageNumber,
	searchPagination,
}: {
	searchPage: SearchResultsPage
	pageNumber: number
	searchPagination: SearchPagination
}) {
	const paginationProps = {
		ariaLabel: "Search result pages",
		className: "pt-4",
		pageNumber,
		pageCount: searchPage.pageCount,
	}
	return searchPagination.renderPageLink ? (
		<Pagination
			{...paginationProps}
			renderPageLink={searchPagination.renderPageLink}
			rowCount={searchPage.rowCount}
			isPagedOnServer
		/>
	) : (
		<Pagination {...paginationProps} onOpenPage={searchPagination.onOpenPage} />
	)
}

// a finding's row, the feed's own with its note, rating, bookmark, and read toggle, its bookmark mark beside a rank
// that stays, the pill of the chapter that narrates it, and its topic after its age. the topic's link stops its click,
// so following it never also opens the note
function SearchFindingRow({
	findingSearchRow,
	rank,
	latestPodcastEpisode,
	topicFeedHandlers,
}: {
	findingSearchRow: FindingSearchRow
	rank: number
	// the finding's topic's latest podcast episode, whose chapters put a pill on the finding if one narrates it
	latestPodcastEpisode: PodcastEpisode | undefined
	topicFeedHandlers?: TopicFeedHandlers
}) {
	const { finding, topic } = findingSearchRow
	return (
		<TopicResource
			resource={finding}
			rank={rank}
			isRatable={topic.canRate}
			isBookmarkable={topic.canBookmark}
			topicFeedHandlers={topicFeedHandlers}
			topic={topic}
			latestPodcastEpisode={latestPodcastEpisode}
			isBookmarkOnLine
		>
			<span>
				in{" "}
				<span onClickCapture={(event) => event.stopPropagation()}>
					<TopicLink topic={topic} />
				</span>
			</span>
		</TopicResource>
	)
}

// one result's row: its number, its kind's icon or avatar, its linked name, its line, and the caller's action
function SearchResultRow({ searchRow, rank, action }: { searchRow: LinkedSearchRow; rank: number; action: ReactNode }) {
	return (
		<div className={cn(DASHED_ROW_CLASS, LIST_ROW_HOVER_CLASS, "group flex items-center")}>
			{/* the row's number, in the slot the feed's rank takes */}
			<span
				className="text-muted-foreground absolute top-0 left-0 grid size-11 place-items-center sm:top-1.5 sm:size-8"
				aria-hidden="true"
			>
				<span className="font-display text-sm tabular-nums">{rank}</span>
			</span>
			{/* the left padding clears the number's slot, and the right padding is the row's own inset */}
			<div className="flex min-w-0 flex-1 items-start gap-2.5 py-3 pr-3 pl-9">
				<SearchRowIcon searchRow={searchRow} />
				<div className="min-w-0 flex-1">
					{/* the name, linked to its page, or a finding's title to its resource */}
					<div className="truncate text-sm">
						<AnchorLink
							href={searchRow.path}
							className="text-foreground max-w-full truncate text-left text-sm font-semibold hover:underline"
						>
							{searchRow.name}
						</AnchorLink>
					</div>
					{/* the line under the name */}
					<div className="text-muted-foreground mt-0.5 flex flex-wrap items-center gap-1.5 text-xs group-hover:text-foreground/80">
						<SearchRowLine searchRow={searchRow} />
					</div>
				</div>
				{action}
			</div>
		</div>
	)
}

// a row's icon: its kind's icon, or a team's or profile's avatar
function SearchRowIcon({ searchRow }: { searchRow: LinkedSearchRow }) {
	switch (searchRow.kind) {
		case "topic":
			return <KindIcon Icon={SEARCH_RESULT_KIND_ICON.topics} label="Topic" />
		case "podcastEpisode":
			return <KindIcon Icon={SEARCH_RESULT_KIND_ICON.podcastEpisodes} label="Podcast episode" />
		case "team":
			return <TeamAvatar team={searchRow.team} className="mt-px size-4 shrink-0" />
		case "user":
			return (
				<UserAvatar
					userId={searchRow.user.userId}
					username={searchRow.user.username}
					avatarVersion={searchRow.user.avatarVersion}
					className="mt-px size-4 shrink-0"
				/>
			)
	}
}

// a row's line: its kind, the topic it is in, its age, its count, and a podcast episode's play pill
function SearchRowLine({ searchRow }: { searchRow: LinkedSearchRow }) {
	switch (searchRow.kind) {
		// a topic, its viewers and followers, and its latest podcast episode's pill
		case "topic":
			return (
				<>
					{toDotSeparatedText([
						"Topic",
						toCountLabel(searchRow.count ?? 0, "viewer"),
						toCountLabel(searchRow.subscriberCount, "follower"),
					])}
					<PodcastEpisodePill podcastEpisode={searchRow.topic.latestPodcastEpisode} />
				</>
			)
		// a podcast episode, the topic it is in, how long ago it was published, its listeners, and its pill
		case "podcastEpisode":
			return (
				<>
					Podcast in <TopicLink topic={searchRow.topic} />
					{` · ${toDotSeparatedText([toAgoLabel(searchRow.date), toCountLabel(searchRow.count ?? 0, "listener")])}`}
					<PodcastEpisodePill podcastEpisode={searchRow.podcastEpisode} />
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
			return <>Profile</>
	}
}

// how long ago a date was, such as 3w ago or today
function toAgoLabel(date: string | null): string {
	const ageLabel = toAgeLabel(date)
	if (!ageLabel) {
		return ""
	}
	return ageLabel === "today" ? "today" : `${ageLabel} ago`
}

// the topic a podcast episode or a finding is in, linked to its page
function TopicLink({ topic }: { topic: { id: string; name: string } }) {
	return (
		<AnchorLink href={toTopicPath(topic)} className="hover:text-foreground underline-offset-2 hover:underline">
			{topic.name}
		</AnchorLink>
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
	return (
		<Icon className="text-muted-foreground group-hover:text-foreground mt-0.5 size-4 shrink-0" aria-label={label} />
	)
}
