import type { PodcastEpisode } from "@carlnotes/contracts/podcast"
import type { FindingSearchRow, SearchResultsPage } from "@carlnotes/contracts/search"
import { cn } from "@carlnotes/nightshift/classNames"
import type { ComponentProps } from "react"
import { AnchorLink } from "@/components/common/AnchorLink"
import { Pagination } from "@/components/common/Pagination"
import { ResourceSkeleton } from "@/components/topic/TopicFeedSkeleton"
import { TopicResource } from "@/components/topic/TopicResource"
import { RESOURCE_LIST_CARD_CLASS } from "@/lib/styleClasses"
import type { TopicFeedHandlers } from "@/providers/TopicFeedProvider"
import { SearchResultRow } from "./SearchResultRow"
import { type LinkedSearchRow, SearchRowLine, SearchRowTopicLink } from "./SearchRowParts"

// how the page row opens a page: links the caller renders, or buttons that call it back
type SearchPagination =
	| { renderPageLink: NonNullable<ComponentProps<typeof Pagination>["renderPageLink"]>; onOpenPage?: undefined }
	| { onOpenPage: (pageNumber: number) => void; renderPageLink?: undefined }

/**
 * The site search's results as the feed lists its findings: each row numbered, with a link to its page and a line
 * with its kind's icon, its kind, its topic, its age, and its count, and a podcast episode's play pill. A finding's row
 * is the feed's own, whose note opens on a click, with its topic after its age. The numbered page row under the list
 * opens the search's other pages.
 */
export function SearchResultsList({
	searchPage,
	searchPagination,
	loadingPageNumber,
	topicFeedHandlers,
}: {
	searchPage: SearchResultsPage
	searchPagination: SearchPagination
	// the page on its way, whose rows show as skeletons under the page row that opened it
	loadingPageNumber?: number
	// what a finding's note does on a read, a rating, a bookmark, or an open. the site's feed provider's if left out
	topicFeedHandlers?: TopicFeedHandlers
}) {
	// the number of the page's first row, counted across every page
	const firstRank = (searchPage.page - 1) * searchPage.pageSize + 1

	// the page the row marks as current, and how many rows the loading page holds
	const pageNumber = loadingPageNumber ?? searchPage.page
	const loadingRowCount = toSearchPageRowCount(searchPage, pageNumber)
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
							<LinkedSearchResultRow
								key={`${searchRow.kind}-${searchRow.id}`}
								searchRow={searchRow}
								rank={firstRank + index}
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
 * Returns how many rows a page of the search holds.
 */
export function toSearchPageRowCount(searchPage: SearchResultsPage, pageNumber: number): number {
	return Math.min(searchPage.pageSize, searchPage.rowCount - (pageNumber - 1) * searchPage.pageSize)
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

/**
 * The numbered pages under the search results. The html holds one page, so a row of links shows without JavaScript too.
 */
export function SearchPageRow({
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

// a finding's row: the feed's own, with the pill of the chapter that narrates it and its topic after its age. the
// topic's link stops its click, so following it never also opens the note
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
					<SearchRowTopicLink topic={topic} />
				</span>
			</span>
		</TopicResource>
	)
}

// a row with its own link, icon, and metadata in the shared layout
function LinkedSearchResultRow({ searchRow, rank }: { searchRow: LinkedSearchRow; rank: number }) {
	return (
		<SearchResultRow
			rank={rank}
			title={
				<AnchorLink
					href={searchRow.path}
					className="text-foreground max-w-full truncate text-left text-sm font-semibold hover:underline"
				>
					{searchRow.name}
				</AnchorLink>
			}
			details={<SearchRowLine searchRow={searchRow} />}
		/>
	)
}
