import type { PodcastEpisodeSummary } from "@carlnotes/contracts/podcast"
import { toPodcastEpisodeTitleLabel } from "@carlnotes/core/lib/labels"
import {
	podcastEpisodeSortValues,
	toPodcastEpisodesTableColumns,
} from "@carlnotes/core/lib/podcastEpisodesTableColumns"
import { View } from "react-native"
import { AnchorLink } from "@/components/common/AnchorLink"
import { Text } from "@/components/primitives/text"
import { DataTable } from "@/components/table/DataTable"
import { CollapsibleSection } from "@/components/topic/CollapsibleSection"
import { PodcastEpisodePlayButton } from "./PodcastEpisodePlayButton"

/**
 * Adapts the web's related-episode table to the existing fixed-column mobile table.
 */
export function PodcastEpisodesSection({
	title,
	titleColumnLabel,
	podcastEpisodes,
}: {
	title: string
	titleColumnLabel: string
	podcastEpisodes: PodcastEpisodeSummary[]
}) {
	const columns = toPodcastEpisodesTableColumns({
		titleColumnLabel,
		renderTitle: (episode) => <EpisodeTitle episode={episode} />,
		renderText: (text) => <Text className="text-sm text-muted-foreground">{text}</Text>,
	})
	if (!podcastEpisodes.length) {
		return null
	}
	return (
		<CollapsibleSection title={title}>
			<DataTable
				rows={podcastEpisodes}
				columns={columns}
				valueByKey={podcastEpisodeSortValues}
				getRowId={(episode) => episode.id}
				initialPageSize={5}
			/>
		</CollapsibleSection>
	)
}

// keep title navigation separate from playback within the fixed first column
function EpisodeTitle({ episode }: { episode: PodcastEpisodeSummary }) {
	const title = toPodcastEpisodeTitleLabel(episode)
	return (
		<View className="flex-row items-center gap-2">
			<View className="min-w-0 flex-1">
				{episode.pagePath ? (
					<AnchorLink href={episode.pagePath} accessibilityLabel={`Open ${title}`}>
						<Text className="text-sm text-link">{title}</Text>
					</AnchorLink>
				) : (
					<Text className="text-sm">{title}</Text>
				)}
			</View>
			<PodcastEpisodePlayButton episode={episode} />
		</View>
	)
}
