import type { PodcastEpisodeSummary } from "@carlnotes/contracts/podcast"
import {
	podcastEpisodeSortValues,
	toPodcastEpisodesTableColumns,
} from "@carlnotes/core/lib/podcastEpisodesTableColumns"
import { cn } from "@carlnotes/nightshift/classNames"
import { PagedTableSection } from "@/components/table/PagedTableSection"
import { PodcastEpisodeTitleLink } from "@/components/table/PodcastEpisodeTitleLink"
import { SortableHeader } from "@/components/table/SortableHeader"
import { TABLE_WIDE_FIRST_COLUMN_CLASS } from "@/lib/styleClasses"

// the section's key and title, the title column's heading, and its podcast episodes with their descriptions
type PodcastEpisodesSectionProps = {
	value: string
	title: string
	titleColumnLabel: string
	podcastEpisodes: PodcastEpisodeSummary[]
}

/**
 * A titled table of podcast episodes, starting at five a page and sortable by title or description, each title linked
 * to its page with its play button beside it and its description beside that. A section with no episodes renders
 * nothing.
 */
export function PodcastEpisodesSection({
	value,
	title,
	titleColumnLabel,
	podcastEpisodes,
}: PodcastEpisodesSectionProps) {
	// share column order, labels, and values while retaining the server-rendered table adapter
	const columns = toPodcastEpisodesTableColumns({
		titleColumnLabel,
		renderTitle: (podcastEpisode) => <PodcastEpisodeTitleLink podcastEpisode={podcastEpisode} />,
		renderText: (text) => text,
	})
	return (
		// the table keeps its width and scrolls in the card on a narrow screen
		<PagedTableSection
			value={value}
			title={title}
			rows={podcastEpisodes}
			rowSortValues={podcastEpisodeSortValues}
			tableClassName="min-w-2xl"
			toRowKey={(podcastEpisode) => podcastEpisode.id}
			renderHeadings={(sort) =>
				columns.map((column, index) => (
					<SortableHeader
						key={column.key}
						sort={sort}
						sortKey={column.key}
						label={column.label}
						className={cn(index === 0 && TABLE_WIDE_FIRST_COLUMN_CLASS, "py-2 font-normal")}
					/>
				))
			}
			renderRowCells={(podcastEpisode) =>
				columns.map((column, index) => (
					<td
						key={column.key}
						className={cn("py-2", index === 0 ? TABLE_WIDE_FIRST_COLUMN_CLASS : "text-muted-foreground")}
					>
						{column.render(podcastEpisode)}
					</td>
				))
			}
		/>
	)
}
