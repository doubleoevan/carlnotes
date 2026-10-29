import { View } from "react-native"
import { Count } from "@/components/common/Count"

/**
 * Presents a supplied listener count without owning a polling loop or inventing an unavailable value.
 */
export function PodcastEpisodeCountsLine({ listenerCount }: { listenerCount?: number | null }) {
	return (
		<View className="mt-8 min-h-5 flex-row items-center justify-center">
			{listenerCount != null && <Count label="Listeners" count={listenerCount} />}
		</View>
	)
}
