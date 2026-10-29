import { cn } from "@carlnotes/nightshift/classNames"
import { type ReactNode, useEffect, useRef, useState } from "react"
import { Animated, AppState, Easing, View } from "react-native"
import { Text } from "@/components/primitives/text"
import { useIsReduceMotionEnabled } from "@/hooks/useIsReduceMotionEnabled"

/**
 * Moves a foreground-only highlight across text, respecting reduced motion.
 */
export function ShimmerText({ children, className }: { children: ReactNode; className?: string }) {
	// measure the real text so its decorative copy wraps at exactly the same width
	const [width, setWidth] = useState(0)
	const progress = useRef(new Animated.Value(0)).current
	const isReduceMotionEnabled = useIsReduceMotionEnabled()
	const highlightWidth = 48
	const translateX = progress.interpolate({ inputRange: [0, 1], outputRange: [-highlightWidth, width] })
	const opacity = progress.interpolate({ inputRange: [0, 0.15, 0.85, 1], outputRange: [0, 0.8, 0.8, 0] })

	// run only while visible and stop the animation on inactivity or removal
	useEffect(() => {
		if (isReduceMotionEnabled || width === 0) {
			progress.setValue(0)
			return
		}
		// drive transforms natively without delaying list interactions
		const shimmer = Animated.loop(
			Animated.timing(progress, {
				toValue: 1,
				duration: 2200,
				easing: Easing.linear,
				useNativeDriver: true,
				isInteraction: false,
			}),
		)
		const handleActivityChange = (): void => {
			// reset before starting or leaving the foreground
			shimmer.stop()
			progress.setValue(0)
			if (AppState.currentState === "active") {
				shimmer.start()
			}
		}
		handleActivityChange()
		const activityListener = AppState.addEventListener("change", handleActivityChange)
		return () => {
			// release the loop and its lifecycle listener
			activityListener.remove()
			shimmer.stop()
			progress.setValue(0)
		}
	}, [isReduceMotionEnabled, progress, width])

	return (
		<View className="min-w-0 shrink overflow-hidden">
			{/* readable text, including the static reduced-motion state */}
			<Text
				className={cn("text-sm text-muted-foreground", className)}
				onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
			>
				{children}
			</Text>
			{/* decorative highlight, hidden from touch and accessibility */}
			{!isReduceMotionEnabled && width > 0 && (
				<Animated.View
					pointerEvents="none"
					accessibilityElementsHidden
					importantForAccessibility="no-hide-descendants"
					style={{
						position: "absolute",
						top: 0,
						bottom: 0,
						left: 0,
						width: highlightWidth,
						overflow: "hidden",
						opacity,
						transform: [{ translateX }],
					}}
				>
					<Animated.View style={{ width, transform: [{ translateX: Animated.multiply(translateX, -1) }] }}>
						<Text className={cn("text-sm", className, "text-foreground")}>{children}</Text>
					</Animated.View>
				</Animated.View>
			)}
		</View>
	)
}
