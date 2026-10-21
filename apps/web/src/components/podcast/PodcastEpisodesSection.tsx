import type { PodcastEpisodeSummary } from "@carlnotes/contracts/podcast"
import { PagedTableSection } from "@/components/table/PagedTableSection"
import { PodcastEpisodeTitleLink } from "@/components/table/PodcastEpisodeTitleLink"
import { SortableHeader, type SortValue } from "@/components/table/SortableHeader"
import { TABLE_WIDE_FIRST_COLUMN_CLASS } from "@/lib/styleClasses"
import { cn } from "@/lib/utils"

// each sortable column's value: the podcast episode's title and its description
const podcastEpisodeSortValues: Record<string, (podcastEpisode: PodcastEpisodeSummary) => SortValue> = {
	episode: (podcastEpisode) => podcastEpisode.title,
	description: (podcastEpisode) => podcastEpisode.description,
}

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
	return (
		// the table keeps its width and scrolls in the card on a narrow screen
		<PagedTableSection
			value={value}
			title={title}
			rows={podcastEpisodes}
			rowSortValues={podcastEpisodeSortValues}
			tableClassName="min-w-2xl"
			toRowKey={(podcastEpisode) => podcastEpisode.id}
			renderHeadings={(sort) => (
				<>
					<SortableHeader
						sort={sort}
						sortKey="episode"
						label={titleColumnLabel}
						className={cn(TABLE_WIDE_FIRST_COLUMN_CLASS, "py-2 font-normal")}
					/>
					<SortableHeader sort={sort} sortKey="description" label="Description" className="py-2 font-normal" />
				</>
			)}
			renderRowCells={(podcastEpisode) => (
				<>
					<td className={cn(TABLE_WIDE_FIRST_COLUMN_CLASS, "py-2")}>
						<PodcastEpisodeTitleLink podcastEpisode={podcastEpisode} />
					</td>
					<td className="text-muted-foreground py-2">{podcastEpisode.description}</td>
				</>
			)}
		/>
	)
}
