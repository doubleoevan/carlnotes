import type { PodcastEpisodeSummary } from "@shared/contracts/podcast"
import { AnchorLink } from "@/components/common/AnchorLink"
import { PodcastEpisodeTooltip } from "@/components/podcast/PodcastEpisodeDetails"
import { PodcastEpisodePlayButton } from "@/components/podcast/PodcastEpisodePlayButton"
import { ICON_TILE_BUTTON_CLASS } from "@/lib/styleClasses"

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
					<AnchorLink href={podcastEpisode.pagePath} className="text-link min-w-0 hover:underline">
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
