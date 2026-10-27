import type { PodcastEpisodeSpeaker } from "@carlnotes/contracts/enums"
import { PODCAST_EPISODE_SPEAKER_NAMES } from "@carlnotes/contracts/podcastEpisodes"
import carlAvatar from "@carlnotes/nightshift/assets/carl-avatar.png"
import viennaAvatar from "@carlnotes/nightshift/assets/vienna-avatar.png"
import { cn } from "@carlnotes/nightshift/classNames"

// each host's own picture: carl the raccoon, and vienna
const HOST_AVATAR_IMAGES: Record<PodcastEpisodeSpeaker, string> = { host: carlAvatar, cohost: viennaAvatar }

/**
 * A host's own avatar image, Carl's or Vienna's, by speaker.
 */
export function HostAvatar({ speaker, className }: { speaker: PodcastEpisodeSpeaker; className?: string }) {
	return (
		<img
			src={HOST_AVATAR_IMAGES[speaker]}
			alt={PODCAST_EPISODE_SPEAKER_NAMES[speaker]}
			className={cn("size-6 shrink-0 rounded-full", className)}
		/>
	)
}
