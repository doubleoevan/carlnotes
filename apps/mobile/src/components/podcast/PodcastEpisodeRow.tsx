import type { PodcastEpisodeSummary } from "@carlnotes/contracts/podcast"
import { toPodcastEpisodeDayAndDurationLabels, toPodcastEpisodeTitleLabel } from "@carlnotes/core/lib/labels"
import { SITE_URL } from "@carlnotes/core/lib/pageHead"
import { View } from "react-native"
import { AnchorLink } from "@/components/common/AnchorLink"
import { toTouchTargetHitSlop } from "@/components/primitives/button"
import { Text } from "@/components/primitives/text"

import { PodcastEpisodePlayButton } from "./PodcastEpisodePlayButton"

/**
 * Shares the web's episode play button, linked title, date, duration, and latest label.
 */
export function PodcastEpisodeRow({
	episode,
	isLatestEpisode = false,
}: {
	episode: PodcastEpisodeSummary
	isLatestEpisode?: boolean
}) {
	const details = [...toPodcastEpisodeDayAndDurationLabels(episode), ...(isLatestEpisode ? ["latest"] : [])]
	return (
		<View className="min-h-11 flex-row items-center gap-3 py-1">
			<PodcastEpisodePlayButton episode={episode} size="default" />
			<View className="min-w-0 flex-1">
				<PodcastEpisodeTitle episode={episode} hasNumber />
				<Text className="text-xs text-muted-foreground">{details.join(" · ")}</Text>
			</View>
		</View>
	)
}

/**
 * Links an episode title with the web's body font and weight.
 */
export function PodcastEpisodeTitle({
	episode,
	hasNumber = false,
	isLarge = false,
}: {
	episode: PodcastEpisodeSummary
	hasNumber?: boolean
	isLarge?: boolean
}) {
	if (!episode.pagePath) {
		return <Text className="text-sm">{toPodcastEpisodeTitleLabel(episode)}</Text>
	}
	return (
		<AnchorLink
			href={`${SITE_URL}${episode.pagePath}`}
			accessibilityLabel={`Open ${toPodcastEpisodeTitleLabel(episode)}`}
			hitSlop={toTouchTargetHitSlop(20)}
			className="justify-center active:opacity-75"
		>
			<Text className={isLarge ? "text-lg font-bold text-foreground" : "text-sm font-bold text-foreground"}>
				{hasNumber ? toPodcastEpisodeTitleLabel(episode) : episode.title}
			</Text>
		</AnchorLink>
	)
}
