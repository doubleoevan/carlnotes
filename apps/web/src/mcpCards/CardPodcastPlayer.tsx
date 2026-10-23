import type { PodcastEpisode } from "@carlnotes/contracts/podcast"
import { useEffect, useState } from "react"
import { AnchorLink } from "@/components/common/AnchorLink"
import { PodcastEpisodeAudio } from "@/components/podcast/PodcastEpisodeAudio"
import { STANDALONE_LINK_CLASS } from "@/lib/styleClasses"
import {
	toLoadedPodcastEpisode,
	unloadPodcastEpisode,
	useIsPodcastPlayerShown,
} from "@/stores/podcastEpisodePlayerStore"

/**
 * A card's one podcast player, the site's own, which every play button in the card plays through. If the host's
 * frame blocks the audio, or its play token has expired, the player gives way to a link to the podcast episode's page.
 */
export function CardPodcastPlayer() {
	// the podcast episode whose audio failed, which the link names
	const [blockedPodcastEpisode, setBlockedPodcastEpisode] = useState<PodcastEpisode | null>(null)
	const isPlayerShown = useIsPodcastPlayerShown()

	// an audio error unloads the podcast episode and keeps it for the link
	useEffect(() => {
		const audioElement = document.querySelector("audio")
		const handleAudioError = (): void => {
			const loadedPodcastEpisode = toLoadedPodcastEpisode()
			if (loadedPodcastEpisode) {
				setBlockedPodcastEpisode(loadedPodcastEpisode)
				unloadPodcastEpisode(loadedPodcastEpisode.id)
			}
		}
		audioElement?.addEventListener("error", handleAudioError)
		return () => audioElement?.removeEventListener("error", handleAudioError)
	}, [])
	return (
		<>
			<PodcastEpisodeAudio />
			{/* the space the fixed player bar covers, so it never hides the card's last row */}
			{isPlayerShown && <div className="h-16" aria-hidden="true" />}
			{/* the podcast episode page's link in place of a player that cannot play here */}
			{blockedPodcastEpisode?.pagePath && !isPlayerShown && (
				<p className="text-muted-foreground mt-3 text-sm">
					This app can't play audio here.{" "}
					<AnchorLink href={blockedPodcastEpisode.pagePath} className={STANDALONE_LINK_CLASS}>
						Listen on CarlNotes
					</AnchorLink>
				</p>
			)}
		</>
	)
}
