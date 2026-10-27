import { Animated, View } from "react-native"

/**
 * Shows the web's orange overflow cue along either native scroll axis.
 */
export function ScrollIndicator({
	scrollOffset,
	viewportSize,
	contentSize,
	isHorizontal = false,
}: {
	scrollOffset: Animated.Value
	viewportSize: number
	contentSize: number
	isHorizontal?: boolean
}) {
	// hide the cue when every item fits in the viewport
	if (viewportSize <= 0 || contentSize <= viewportSize + 1) {
		return null
	}

	// map native scroll distance to the inset track
	const trackSize = Math.max(0, viewportSize - 8)
	const thumbSize = Math.min(trackSize, Math.max(24, (trackSize * viewportSize) / contentSize))
	const translation = scrollOffset.interpolate({
		inputRange: [0, contentSize - viewportSize],
		outputRange: [0, trackSize - thumbSize],
		extrapolate: "clamp",
	})
	return (
		<View
			pointerEvents="none"
			accessibilityElementsHidden
			importantForAccessibility="no-hide-descendants"
			className={isHorizontal ? "absolute right-1 bottom-0.5 left-1 h-1.5" : "absolute top-1 right-0.5 bottom-1 w-1.5"}
		>
			<Animated.View
				className="rounded-full bg-primary/70"
				style={
					isHorizontal
						? { height: 6, width: thumbSize, transform: [{ translateX: translation }] }
						: { width: 6, height: thumbSize, transform: [{ translateY: translation }] }
				}
			/>
		</View>
	)
}
