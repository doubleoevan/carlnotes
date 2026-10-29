import {
	type PodcastEpisodeSeekBarElements,
	type PodcastEpisodeSeekBarProps,
	PodcastEpisodeSeekBar as SharedPodcastEpisodeSeekBar,
} from "@carlnotes/core/components/PodcastEpisodeSeekBar"
import { toClockLabel } from "@carlnotes/core/lib/labels"
import {
	SKIP_BACK_SECONDS,
	SKIP_FORWARD_SECONDS,
	toPodcastEpisodeSeekSeconds,
} from "@carlnotes/core/lib/podcastEpisodePlayback"
import Slider from "@react-native-community/slider"
import { type ComponentProps, useLayoutEffect, useRef } from "react"
import { Platform, View } from "react-native"
import { useCSSVariable } from "uniwind"
import { Text } from "@/components/primitives/text"

const elements: PodcastEpisodeSeekBarElements = {
	Group: View,
	Text,
	Track: SeekTrack,
	Segment: ({ weight, percent }) => (
		<View accessible={false} className="h-1.5 overflow-hidden rounded-full bg-muted" style={{ flex: weight }}>
			<View className="h-full bg-primary" style={{ width: `${percent}%` }} />
		</View>
	),
}

/**
 * Adapts shared chapter segments to a touch-adjustable and screen-reader-adjustable seek control.
 */
export function PodcastEpisodeSeekBar(props: PodcastEpisodeSeekBarProps) {
	return <SharedPodcastEpisodeSeekBar {...props} elements={elements} />
}

/**
 * Places the installed system slider over chapter segments for touch and accessibility seeking.
 */
export function SeekTrack({
	children,
	positionSeconds,
	durationSeconds,
	onSeek,
	onPreviewSeek,
}: ComponentProps<PodcastEpisodeSeekBarElements["Track"]>) {
	// give Android's slider a visible drag handle
	const primaryColor = useCSSVariable("--color-primary") as string
	const isAndroid = Platform.OS === "android"

	// keep platform progress updates from moving the thumb under an active drag
	const isSliding = useRef(false)
	const lastPosition = useRef(positionSeconds)
	useLayoutEffect(() => {
		if (!isSliding.current) {
			lastPosition.current = positionSeconds
		}
	}, [positionSeconds])
	return (
		<View
			className="relative h-11 flex-1 justify-center"
			testID="podcast-seek"
			accessible
			accessibilityRole="adjustable"
			accessibilityLabel="Seek"
			accessibilityState={{ disabled: durationSeconds <= 0 }}
			accessibilityValue={{
				min: 0,
				max: durationSeconds,
				now: positionSeconds,
				text: `${toClockLabel(positionSeconds)} of ${toClockLabel(durationSeconds)}`,
			}}
			accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
			onAccessibilityAction={({ nativeEvent: { actionName } }) => {
				if (durationSeconds <= 0 || (actionName !== "increment" && actionName !== "decrement")) {
					return
				}
				// give screen-reader gestures the same bounded skips as the playback buttons
				const skipSeconds = actionName === "increment" ? SKIP_FORWARD_SECONDS : -SKIP_BACK_SECONDS
				const nextPosition = toPodcastEpisodeSeekSeconds({
					positionSeconds: lastPosition.current + skipSeconds,
					durationSeconds,
				})
				lastPosition.current = nextPosition
				onSeek(nextPosition)
			}}
		>
			<View
				pointerEvents="none"
				accessibilityElementsHidden
				importantForAccessibility="no-hide-descendants"
				className="flex-row items-center gap-1"
			>
				{children}
			</View>
			<Slider
				accessible={false}
				accessibilityElementsHidden
				importantForAccessibility="no-hide-descendants"
				minimumValue={0}
				maximumValue={Math.max(1, durationSeconds)}
				value={isSliding.current ? lastPosition.current : positionSeconds}
				disabled={durationSeconds <= 0}
				tapToSeek
				minimumTrackTintColor="transparent"
				maximumTrackTintColor="transparent"
				thumbTintColor={isAndroid ? primaryColor : "transparent"}
				// keep the system slider above UIKit's hit-testing opacity threshold and inside the visible bounds
				style={{ position: "absolute", left: 0, right: 0, height: isAndroid ? 48 : 44, opacity: isAndroid ? 1 : 0.02 }}
				onSlidingStart={() => {
					isSliding.current = true
				}}
				onValueChange={(seconds) => {
					lastPosition.current = seconds
					onPreviewSeek(seconds)
				}}
				onSlidingComplete={(seconds) => {
					isSliding.current = false
					lastPosition.current = seconds
					onSeek(seconds)
				}}
			/>
		</View>
	)
}
