import { View } from "react-native"
import { Text } from "@/components/primitives/text"

/**
 * Presents a supplied listener count without owning a polling loop or inventing an unavailable value.
 */
export function PodcastEpisodeCountsLine({ listenerCount }: { listenerCount?: number | null }) {
	return (
		<View className="mt-8 min-h-5 flex-row items-center justify-center gap-1.5">
			{listenerCount != null && (
				<>
					<Text className="font-display text-sm text-muted-foreground">Listeners:</Text>
					<Text className="px-1.5 text-sm font-semibold tabular-nums">{listenerCount.toLocaleString()}</Text>
				</>
			)}
		</View>
	)
}
