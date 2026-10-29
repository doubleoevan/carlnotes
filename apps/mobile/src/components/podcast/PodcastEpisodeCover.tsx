import { toApiUrl } from "@carlnotes/client/apiClient"
import type { PodcastEpisode } from "@carlnotes/contracts/podcast"
import { Image } from "expo-image"
import { useState } from "react"
import { View } from "react-native"

/**
 * Shows the episode cover over the shared themed placeholder surface.
 */
export function PodcastEpisodeCover({
	podcastEpisode,
	className,
	isRecording = false,
}: {
	podcastEpisode: Pick<PodcastEpisode, "smallCoverUrl" | "title">
	className?: string
	isRecording?: boolean
}) {
	const [failedUrl, setFailedUrl] = useState<string | null>(null)
	const coverUrl = podcastEpisode.smallCoverUrl !== failedUrl ? podcastEpisode.smallCoverUrl : null
	const placeholder = toApiUrl(isRecording ? "/podcast-cover-recording.jpg" : "/podcast-cover-placeholder.jpg")
	return (
		<View className={`shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted ${className ?? ""}`}>
			{
				<Image
					source={{ uri: coverUrl ? toApiUrl(coverUrl) : placeholder }}
					onError={() => setFailedUrl(podcastEpisode.smallCoverUrl)}
					accessibilityLabel={podcastEpisode.title ? `Cover of ${podcastEpisode.title}` : "Episode cover"}
					style={{ width: "100%", height: "100%" }}
					contentFit="cover"
				/>
			}
		</View>
	)
}
