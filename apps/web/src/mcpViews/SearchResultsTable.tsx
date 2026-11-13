import type { McpSearchPage } from "@carlnotes/contracts/mcpViews"
import type { FindingSearchRow, SearchRow } from "@carlnotes/contracts/search"
import { DataTable, type TableColumn } from "@carlnotes/core/components/DataTable"
import { useState } from "react"
import { AnchorLink } from "@/components/common/AnchorLink"
import { SearchPageRow, SearchResultsSkeleton, toSearchPageRowCount } from "@/components/search/SearchResultsList"
import { SearchRowLine, SearchRowTopicLink } from "@/components/search/SearchRowParts"
import { TableCard } from "@/components/table/TableCard"
import { ResourceMetadata } from "@/components/topic/TopicFindingSummary"
import { METADATA_LINE_CLASS } from "@/lib/styleClasses"
import type { TopicFeedHandlers } from "@/providers/TopicFeedProvider"
import { McpViewFindingDetails, McpViewFindingExpandButton, McpViewFindingTitle } from "./McpViewFindingCells"
import { McpViewSubscribeButton } from "./McpViewSubscribeButton"
import { MCP_VIEW_CONTROLS_COLUMN, MCP_VIEW_TABLE_ELEMENTS, UNSORTED_MCP_VIEW_TABLE_SORT } from "./mcpViewElements"

// the controls column's width in pixels, which fits Follow
const SEARCH_CONTROLS_COLUMN_WIDTH = 110

/**
 * The search tool's page as a table: each result's link and line, Follow on a Topic, Carl's notes and a finding's
 * controls on expanding its row, and the numbered pages under it.
 */
export function SearchResultsTable({
	searchPage,
	loadingPageNumber,
	topicFeedHandlers,
	onOpenPage,
}: {
	searchPage: McpSearchPage
	loadingPageNumber: number | undefined
	topicFeedHandlers: TopicFeedHandlers
	onOpenPage: (pageNumber: number) => void
}) {
	const [expandedRowId, setExpandedRowId] = useState<string | null>(null)
	const pageNumber = loadingPageNumber ?? searchPage.page

	// a finding's expand button, or Follow on a Topic, and nothing on the other kinds
	const renderControls = (searchRow: SearchRow): React.ReactNode => {
		if (searchRow.kind === "topic") {
			return (
				<div className="flex justify-end">
					<McpViewSubscribeButton topicId={searchRow.id} isSubscribed={searchRow.isSubscribed} />
				</div>
			)
		}
		if (searchRow.kind !== "finding") {
			return null
		}
		return (
			<McpViewFindingExpandButton
				isExpanded={expandedRowId === searchRow.id}
				onToggleExpanded={() => setExpandedRowId(expandedRowId === searchRow.id ? null : searchRow.id)}
			/>
		)
	}
	const columns: TableColumn<SearchRow>[] = [
		{
			key: "result",
			label: "Result",
			width: 0,
			render: (searchRow) =>
				searchRow.kind === "finding" ? (
					<FindingResult findingSearchRow={searchRow} searchPage={searchPage} />
				) : (
					<div className="min-w-0">
						<AnchorLink href={searchRow.path} className="text-foreground text-sm font-semibold hover:underline">
							{searchRow.name}
						</AnchorLink>
						<div className={METADATA_LINE_CLASS}>
							<SearchRowLine searchRow={searchRow} />
						</div>
					</div>
				),
		},
		{ ...MCP_VIEW_CONTROLS_COLUMN, width: SEARCH_CONTROLS_COLUMN_WIDTH, render: renderControls },
	]
	return (
		<>
			{/* the loading page's skeleton rows, or the page's results */}
			{loadingPageNumber ? (
				<SearchResultsSkeleton rowCount={toSearchPageRowCount(searchPage, loadingPageNumber)} />
			) : (
				<TableCard className="px-3 py-1">
					<DataTable
						columns={columns}
						renderedRows={searchPage.rows.map((searchRow) => ({ row: searchRow }))}
						getRowId={(searchRow) => `${searchRow.kind}-${searchRow.id}`}
						sort={UNSORTED_MCP_VIEW_TABLE_SORT}
						renderDetails={(searchRow) =>
							searchRow.kind === "finding" &&
							expandedRowId === searchRow.id && (
								<McpViewFindingDetails
									topicFinding={searchRow.finding}
									topic={searchRow.topic}
									topicFeedHandlers={topicFeedHandlers}
								/>
							)
						}
						elements={MCP_VIEW_TABLE_ELEMENTS}
					/>
				</TableCard>
			)}
			{/* the numbered pages, shown once there is more than one */}
			{searchPage.pageCount > 1 && (
				<SearchPageRow searchPage={searchPage} pageNumber={pageNumber} searchPagination={{ onOpenPage }} />
			)}
		</>
	)
}

// a finding's result: its title, the pill of the chapter that narrates it, and its source and age with its Topic
function FindingResult({
	findingSearchRow,
	searchPage,
}: {
	findingSearchRow: FindingSearchRow
	searchPage: McpSearchPage
}) {
	const { finding, topic } = findingSearchRow
	return (
		<McpViewFindingTitle
			topicFinding={finding}
			podcastEpisode={searchPage.podcastEpisodes.find((podcastEpisode) => podcastEpisode.topicId === topic.id)}
		>
			<ResourceMetadata resource={finding} />
			<span>
				· <SearchRowTopicLink topic={topic} />
			</span>
		</McpViewFindingTitle>
	)
}
