import type { PodcastEpisodeSummary } from "@carlnotes/contracts/podcast"
import { AnchorLink } from "@/components/common/AnchorLink"
import { PodcastEpisodeTooltip } from "@/components/podcast/PodcastEpisodeDetails"
import { PodcastEpisodePlayButton } from "@/components/podcast/PodcastEpisodePlayButton"
import { ICON_TILE_BUTTON_CLASS, STANDALONE_LINK_CLASS } from "@/lib/styleClasses"
import { cn } from "@/lib/utils"

/**
 * A podcast episode's title in a table, linking to its page, with its play button beside the title. The title and the
 * button each open the episode's tooltip.
 */
export function PodcastEpisodeTitleLink({ podcastEpisode }: { podcastEpisode: PodcastEpisodeSummary }) {
	return (
		<span className="flex items-center gap-2">
			{/* the title, linked to the podcast episode's page with its tooltip if it has one */}
			{podcastEpisode.pagePath ? (
				<PodcastEpisodeTooltip podcastEpisode={podcastEpisode}>
					<AnchorLink href={podcastEpisode.pagePath} className={cn(STANDALONE_LINK_CLASS, "min-w-0")}>
						{podcastEpisode.title}
					</AnchorLink>
				</PodcastEpisodeTooltip>
			) : (
				<span className="min-w-0">{podcastEpisode.title}</span>
			)}

			{/* the play button */}
			<PodcastEpisodePlayButton podcastEpisode={podcastEpisode} className={ICON_TILE_BUTTON_CLASS} />
		</span>
	)
}
