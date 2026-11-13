import type { TopicFinding } from "@carlnotes/contracts/findings"
import type { PodcastEpisode } from "@carlnotes/contracts/podcast"
import type { FindingSearchTopic } from "@carlnotes/contracts/search"
import { DataTable, type TableColumn } from "@carlnotes/core/components/DataTable"
import { toAgeLabel } from "@carlnotes/core/lib/labels"
import { cn } from "@carlnotes/nightshift/classNames"
import { type ReactNode, useState } from "react"
import { HostFavicon } from "@/components/common/HostFavicon"
import { ResourceMetadata } from "@/components/topic/TopicFindingSummary"
import { METADATA_LINE_CLASS } from "@/lib/styleClasses"
import type { TopicFeedHandlers } from "@/providers/TopicFeedProvider"
import { McpViewFindingDetails, McpViewFindingExpandButton, McpViewFindingTitle } from "./McpViewFindingCells"
import { MCP_VIEW_CONTROLS_COLUMN, MCP_VIEW_TABLE_ELEMENTS, UNSORTED_MCP_VIEW_TABLE_SORT } from "./mcpViewElements"

// each column's width in pixels, with the title taking what is left
const SOURCE_COLUMN_WIDTH = 130
const PUBLISHED_COLUMN_WIDTH = 90

// a table row: its finding, the finding's Topic, the podcast episode whose chapter may narrate it, and what goes under
// its title
export type FindingsTableRow = {
	topicFinding: TopicFinding
	topic: FindingSearchTopic
	latestPodcastEpisode: PodcastEpisode | null | undefined
	titleLine?: ReactNode
}

/**
 * Findings as a table: title, source, and publish date, with Carl's notes and a finding's controls on expanding a row.
 */
export function FindingsTable({
	rows,
	topicFeedHandlers,
}: {
	rows: FindingsTableRow[]
	topicFeedHandlers: TopicFeedHandlers
}) {
	const [expandedFindingId, setExpandedFindingId] = useState<string | null>(null)
	const columns: TableColumn<FindingsTableRow>[] = [
		{
			key: "title",
			label: "Finding",
			width: 0,
			render: ({ topicFinding, latestPodcastEpisode, titleLine }) => (
				<McpViewFindingTitle topicFinding={topicFinding} podcastEpisode={latestPodcastEpisode}>
					{titleLine}
				</McpViewFindingTitle>
			),
		},
		{
			key: "source",
			label: "Source",
			width: SOURCE_COLUMN_WIDTH,
			render: ({ topicFinding: { source, faviconPath } }) =>
				source && (
					<span className="text-muted-foreground flex min-w-0 items-center gap-1.5 text-xs">
						<HostFavicon faviconPath={faviconPath} />
						<span className="min-w-0">{source}</span>
					</span>
				),
		},
		{
			key: "published",
			label: "Published",
			width: PUBLISHED_COLUMN_WIDTH,
			render: ({ topicFinding: { publishedAt } }) => (
				<span className="text-muted-foreground text-xs">{toAgeLabel(publishedAt)}</span>
			),
		},
		{
			...MCP_VIEW_CONTROLS_COLUMN,
			render: ({ topicFinding }) => (
				<McpViewFindingExpandButton
					isExpanded={expandedFindingId === topicFinding.findingId}
					onToggleExpanded={() =>
						setExpandedFindingId(expandedFindingId === topicFinding.findingId ? null : topicFinding.findingId)
					}
				/>
			),
		},
	]
	return (
		<DataTable
			columns={columns}
			renderedRows={rows.map((row) => ({ row }))}
			getRowId={({ topicFinding }) => topicFinding.findingId}
			sort={UNSORTED_MCP_VIEW_TABLE_SORT}
			renderDetails={({ topicFinding, topic }) =>
				expandedFindingId === topicFinding.findingId && (
					<>
						{/* the source and date a narrow table leaves out */}
						<div className={cn(METADATA_LINE_CLASS, "mb-2 @md:hidden")}>
							<ResourceMetadata resource={topicFinding} />
						</div>
						<McpViewFindingDetails topicFinding={topicFinding} topic={topic} topicFeedHandlers={topicFeedHandlers} />
					</>
				)
			}
			elements={MCP_VIEW_TABLE_ELEMENTS}
		/>
	)
}
