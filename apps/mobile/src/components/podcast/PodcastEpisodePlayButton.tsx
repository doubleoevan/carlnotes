import type { PodcastEpisodeSummary } from "@carlnotes/contracts/podcast"
import { SITE_URL } from "@carlnotes/core/lib/pageHead"
import { Play } from "lucide-react-native"
import { AnchorLink } from "@/components/common/AnchorLink"
import { toTouchTargetHitSlop } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"

// inline Topic actions, episode rows, and the featured player use the web's three play sizes
const PLAY_BUTTON_CLASSES = { sm: "size-6", default: "size-11", lg: "size-14" }
const PLAY_ICON_CLASSES = { sm: "size-3", default: "size-4", lg: "size-7" }

/**
 * Opens the published podcast's player from the matching primary play circle.
 */
export function PodcastEpisodePlayButton({
	episode,
	size = "sm",
}: {
	episode: PodcastEpisodeSummary
	size?: keyof typeof PLAY_BUTTON_CLASSES
}) {
	if (!episode.pagePath) {
		return null
	}
	return (
		<AnchorLink
			href={`${SITE_URL}${episode.pagePath}`}
			accessibilityLabel={`Play episode ${episode.episodeNumber}`}
			accessibilityHint="Opens the player on carlnotes.com"
			hitSlop={toTouchTargetHitSlop(size === "sm" ? 24 : size === "default" ? 44 : 56)}
			className={`${PLAY_BUTTON_CLASSES[size]} shrink-0 items-center justify-center rounded-full bg-primary shadow-raised`}
		>
			<Icon as={Play} className={`${PLAY_ICON_CLASSES[size]} text-primary-foreground`} fill="currentColor" />
		</AnchorLink>
	)
}
