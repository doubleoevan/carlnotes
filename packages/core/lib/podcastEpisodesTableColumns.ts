import type { PodcastEpisodeSummary } from "@carlnotes/contracts/podcast"
import type { ReactNode } from "react"
import type { TableColumn } from "../components/DataTable"

export const podcastEpisodeSortValues = {
	episode: (episode: PodcastEpisodeSummary) => episode.title,
	description: (episode: PodcastEpisodeSummary) => episode.description,
}

/**
 * Defines the shared related-episode table's title and description columns.
 */
export function toPodcastEpisodesTableColumns({
	titleColumnLabel,
	renderTitle,
	renderText,
}: {
	titleColumnLabel: string
	renderTitle: (episode: PodcastEpisodeSummary) => ReactNode
	renderText: (text: string) => ReactNode
}): TableColumn<PodcastEpisodeSummary>[] {
	return [
		{ key: "episode", label: titleColumnLabel, width: 240, render: renderTitle },
		{
			key: "description",
			label: "Description",
			width: 400,
			render: (episode) => renderText(episode.description ?? ""),
		},
	]
}
