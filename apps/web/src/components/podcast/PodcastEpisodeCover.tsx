import type { PodcastEpisode } from "@carlnotes/contracts/podcast"
import { cn } from "@carlnotes/nightshift/classNames"
import { useSiteAssetUrl } from "@/hooks/useSiteAssetUrl"

// the cover that shows until a podcast episode's own loads
const PLACEHOLDER_COVER_PATH = "/podcast-cover-placeholder.jpg"

// the podcast episode whose cover shows, and the classes that size the square
type PodcastEpisodeCoverProps = { podcastEpisode: Pick<PodcastEpisode, "smallCoverUrl" | "title">; className?: string }

/**
 * A podcast episode's cover in a square. The placeholder cover shows until the cover loads,
 * and stays if no cover loads.
 */
export function PodcastEpisodeCover({ podcastEpisode, className }: PodcastEpisodeCoverProps) {
	const coverUrl = useSiteAssetUrl(podcastEpisode.smallCoverUrl)
	return (
		<span
			style={{ backgroundImage: `url(${useSiteAssetUrl(PLACEHOLDER_COVER_PATH)})` }}
			className={cn("relative block shrink-0 overflow-hidden rounded-lg bg-cover", className)}
		>
			{coverUrl && (
				<img
					key={coverUrl}
					src={coverUrl}
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
