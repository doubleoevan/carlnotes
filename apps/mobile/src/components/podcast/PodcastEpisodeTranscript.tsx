import type { PodcastEpisodeTranscriptBlock } from "@carlnotes/contracts/podcast"
import {
	type PodcastEpisodeTranscriptElements,
	PodcastEpisodeTranscript as SharedPodcastEpisodeTranscript,
} from "@carlnotes/core/components/PodcastEpisodeTranscript"
import { colors } from "@carlnotes/nightshift/colors"
import { type ComponentRef, useEffect, useRef, useState } from "react"
import { Animated, View } from "react-native"
import { ScrollView } from "react-native-gesture-handler"
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg"
import { ScrollIndicator } from "@/components/common/ScrollIndicator"
import { Text } from "@/components/primitives/text"
import { MoreButton } from "@/components/topic/MoreButton"
import { useColorMode } from "@/theme"

/**
 * The app's transcript elements. A Topic Post's discussion card draws its transcript's lines with the same Text and
 * Strong.
 */
export const PODCAST_EPISODE_TRANSCRIPT_ELEMENTS: PodcastEpisodeTranscriptElements = {
	Card: TranscriptCard,
	Group: View,
	Text,
	Strong: Text,
	Heading: ({ children, className }) => (
		<View className="mb-2 flex-row items-center gap-3">
			<View className="min-w-6 flex-1 border-t border-dashed border-separator-strong" />
			<Text accessibilityRole="header" className={`shrink ${className ?? ""}`}>
				{children}
			</Text>
			<View className="min-w-6 flex-1 border-t border-dashed border-separator-strong" />
		</View>
	),
	Divider: () => <View className="mb-3 border-t border-dashed border-separator-strong" />,
	More: (props) => <MoreButton {...props} />,
}

/**
 * Adapts the shared transcript to bounded platform scrolling with the orange overflow indicator.
 */
export function PodcastEpisodeTranscript({ transcript }: { transcript: PodcastEpisodeTranscriptBlock[] }) {
	return <SharedPodcastEpisodeTranscript transcript={transcript} elements={PODCAST_EPISODE_TRANSCRIPT_ELEMENTS} />
}

// keep the transcript bounded while expanded and preserve its complete text for screen readers
function TranscriptCard({ children, isExpanded }: React.ComponentProps<PodcastEpisodeTranscriptElements["Card"]>) {
	const fadeColor = colors.card[useColorMode()]
	const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null)
	useEffect(() => {
		if (!isExpanded) {
			scrollRef.current?.scrollTo({ y: 0, animated: false })
		}
	}, [isExpanded])
	const scrollY = useRef(new Animated.Value(0)).current
	const [height, setHeight] = useState(0)
	const [contentHeight, setContentHeight] = useState(0)
	return (
		<View className="overflow-hidden rounded-lg border border-separator bg-card shadow-raised">
			<ScrollView
				ref={scrollRef}
				scrollEnabled={isExpanded}
				nestedScrollEnabled
				showsVerticalScrollIndicator={false}
				style={{ maxHeight: isExpanded ? 640 : 320 }}
				contentContainerStyle={{ padding: 20 }}
				onLayout={(event) => setHeight(event.nativeEvent.layout.height)}
				onContentSizeChange={(_, nextHeight) => setContentHeight(nextHeight)}
				onScroll={(event) => scrollY.setValue(event.nativeEvent.contentOffset.y)}
				scrollEventThrottle={16}
			>
				{children}
			</ScrollView>
			{!isExpanded && contentHeight > height && (
				<View
					pointerEvents="none"
					accessibilityElementsHidden
					importantForAccessibility="no-hide-descendants"
					className="absolute inset-x-0 bottom-0 h-32"
				>
					<Svg width="100%" height="100%">
						<Defs>
							<LinearGradient id="transcript-fade" x1="0" y1="0" x2="0" y2="1">
								<Stop offset="0" stopColor={fadeColor} stopOpacity="0" />
								<Stop offset="1" stopColor={fadeColor} />
							</LinearGradient>
						</Defs>
						<Rect width="100%" height="100%" fill="url(#transcript-fade)" />
					</Svg>
				</View>
			)}
			{isExpanded && <ScrollIndicator scrollOffset={scrollY} viewportSize={height} contentSize={contentHeight} />}
		</View>
	)
}
