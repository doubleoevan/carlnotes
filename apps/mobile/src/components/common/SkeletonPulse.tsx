import { type ReactNode, useEffect, useRef } from "react"
import { Animated } from "react-native"
import { useIsReduceMotionEnabled } from "@/hooks/useIsReduceMotionEnabled"

/**
 * Pulses loading placeholders unless the device requests reduced motion.
 */
export function SkeletonPulse({ children }: { children: ReactNode }) {
	// follow the device preference throughout the loading state
	const opacity = useRef(new Animated.Value(1)).current
	const isReduceMotionEnabled = useIsReduceMotionEnabled()
	useEffect(() => {
		if (isReduceMotionEnabled) {
			opacity.setValue(1)
			return
		}

		// run one native animation for the entire placeholder layout
		const pulse = Animated.loop(
			Animated.sequence([
				Animated.timing(opacity, { toValue: 0.45, duration: 800, useNativeDriver: true, isInteraction: false }),
				Animated.timing(opacity, { toValue: 1, duration: 800, useNativeDriver: true, isInteraction: false }),
			]),
		)
		pulse.start()
		return () => {
			pulse.stop()
			opacity.setValue(1)
		}
	}, [isReduceMotionEnabled, opacity])
	return <Animated.View style={{ opacity }}>{children}</Animated.View>
}
