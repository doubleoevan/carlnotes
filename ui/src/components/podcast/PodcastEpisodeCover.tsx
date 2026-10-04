import type { PodcastEpisode } from "@shared/contracts"
import { COVER_PLACEHOLDER_CLASS } from "@/lib/styleClasses"
import { cn } from "@/lib/utils"

// the podcast episode whose cover shows, and the classes that size the square
type PodcastEpisodeCoverProps = { podcastEpisode: Pick<PodcastEpisode, "smallCoverUrl" | "title">; className?: string }

/**
 * A podcast episode's cover in a square. The placeholder cover shows until the cover loads,
 * and stays if no cover loads.
 */
export function PodcastEpisodeCover({ podcastEpisode, className }: PodcastEpisodeCoverProps) {
	return (
		<span className={cn(COVER_PLACEHOLDER_CLASS, "relative block shrink-0 overflow-hidden rounded-lg", className)}>
			{podcastEpisode.smallCoverUrl && (
				<img
					key={podcastEpisode.smallCoverUrl}
					src={podcastEpisode.smallCoverUrl}
					alt={podcastEpisode.title ? `Cover of ${podcastEpisode.title}` : ""}
					onError={(event) => {
						event.currentTarget.hidden = true
					}}
					className="absolute inset-0 size-full object-cover"
				/>
			)}
		</span>
	)
}
