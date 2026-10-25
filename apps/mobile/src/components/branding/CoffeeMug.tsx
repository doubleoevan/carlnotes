// the coffee mug the web draws in the CarlNotes logo, from the coffee mug Nightshift shares

import { MD_BREAKPOINT_REM } from "@carlnotes/nightshift/breakpoints"
import {
	COFFEE_MUG_CUP_PATH,
	COFFEE_MUG_HANDLE_PATH,
	COFFEE_MUG_VIEW_BOX,
	COFFEE_MUG_VIEW_BOX_SIZE,
	coffeeMugSteamMotion,
	coffeeMugSteamWisps,
	coffeeMugStyle,
	toSteamWispPath,
} from "@carlnotes/nightshift/coffeeMug"
import { toPixels } from "@carlnotes/nightshift/units"
import { memo, type ReactNode, useEffect, useRef } from "react"
import { Animated, Easing, StyleSheet, useWindowDimensions, View } from "react-native"
import { Path } from "react-native-svg"
import { ClassNameSvg } from "@/components/common/ClassNameSvg"
import { useFontScaledSize } from "@/hooks/useFontScaledSize"
import { useIsReduceMotionEnabled } from "@/hooks/useIsReduceMotionEnabled"

// the narrowest screen the steam moves on, in points, the md breakpoint the web's phone rule holds it still below
const MD_BREAKPOINT_WIDTH = toPixels(MD_BREAKPOINT_REM)

// a steam wisp's x position and delay, the size the mug draws at, whether the wisp holds still, and the classes that
// color the wisp
type SteamWispProps = {
	wisp: (typeof coffeeMugSteamWisps)[number]
	size: number
	isSteamStill: boolean
	className?: string
}

/**
 * A coffee-mug icon with steam rising from the cup, at the web's 26 points unless a size is given, grown with the
 * system text size. The steam holds still on a phone and under reduced motion, as the web's does.
 */
export const CoffeeMug = memo(function CoffeeMug({
	className,
	size: baseSize = 26,
}: {
	className?: string
	size?: number
}) {
	// the mug's size, and whether its steam holds still
	const size = useFontScaledSize(baseSize)
	const { width } = useWindowDimensions()
	const isSteamStill = useIsReduceMotionEnabled() || width < MD_BREAKPOINT_WIDTH
	return (
		<View
			style={{ width: size, height: size }}
			accessibilityElementsHidden
			importantForAccessibility="no-hide-descendants"
		>
			{/* steam */}
			{coffeeMugSteamWisps.map((wisp) => (
				<SteamWisp key={wisp.x} wisp={wisp} size={size} isSteamStill={isSteamStill} className={className} />
			))}
			{/* the cup body, drawn once as a faint fill and once as the outline, and the handle */}
			<MugLayer className={className} size={size}>
				<Path d={COFFEE_MUG_CUP_PATH} fill="currentColor" opacity={coffeeMugStyle.cupFillOpacity} />
				<Path
					d={COFFEE_MUG_CUP_PATH}
					stroke="currentColor"
					strokeWidth={coffeeMugStyle.cupStrokeWidth}
					strokeLinejoin="round"
				/>
				<Path d={COFFEE_MUG_HANDLE_PATH} stroke="currentColor" strokeWidth={coffeeMugStyle.cupStrokeWidth} />
			</MugLayer>
		</View>
	)
})

// one steam wisp that rises, widens, and fades on repeat, or holds still at its resting opacity
function SteamWisp({ wisp, size, isSteamStill, className }: SteamWispProps) {
	const riseProgress = useRef(new Animated.Value(0)).current

	// run the wisp's rise on the native thread from the start, on repeat after its delay, and stop it if the steam holds
	// still or the mug leaves the screen
	useEffect(() => {
		if (isSteamStill) {
			return
		}
		riseProgress.setValue(0)
		const rise = Animated.timing(riseProgress, {
			toValue: 1,
			duration: coffeeMugSteamMotion.periodMs,
			easing: Easing.inOut(Easing.ease),
			useNativeDriver: true,
		})
		const riseLoop = Animated.sequence([Animated.delay(wisp.delayMs), Animated.loop(rise)])
		riseLoop.start()
		return () => riseLoop.stop()
	}, [isSteamStill, riseProgress, wisp.delayMs])

	// the wisp's opacity, rise, and width along its rise. a view box unit is the mug's size over the view box size
	const pointsPerViewBoxUnit = size / COFFEE_MUG_VIEW_BOX_SIZE
	const { peakFraction, peakOpacity, startOffsetY, endOffsetY, endWidthScale, restingOpacity } = coffeeMugSteamMotion
	const wispStyle = isSteamStill
		? { opacity: restingOpacity }
		: {
				opacity: riseProgress.interpolate({ inputRange: [0, peakFraction, 1], outputRange: [0, peakOpacity, 0] }),
				transform: [
					{
						translateY: riseProgress.interpolate({
							inputRange: [0, 1],
							outputRange: [startOffsetY * pointsPerViewBoxUnit, endOffsetY * pointsPerViewBoxUnit],
						}),
					},
					{ scaleX: riseProgress.interpolate({ inputRange: [0, 1], outputRange: [1, endWidthScale] }) },
				],
			}
	return (
		<Animated.View style={[StyleSheet.absoluteFill, styles.steamOrigin, wispStyle]}>
			<MugLayer className={className} size={size}>
				<Path
					d={toSteamWispPath(wisp.x)}
					stroke="currentColor"
					strokeWidth={coffeeMugStyle.steamStrokeWidth}
					strokeLinecap="round"
					opacity={coffeeMugStyle.steamOpacity}
				/>
			</MugLayer>
		</Animated.View>
	)
}

// one full-size svg layer in the mug's view box, stacked over the other layers
function MugLayer({ className, size, children }: { className?: string; size: number; children: ReactNode }) {
	return (
		<ClassNameSvg
			className={className}
			width={size}
			height={size}
			viewBox={COFFEE_MUG_VIEW_BOX}
			fill="none"
			style={StyleSheet.absoluteFill}
		>
			{children}
		</ClassNameSvg>
	)
}

// a wisp widens from the bottom center of the mug's box, as the web's transform origin does
const styles = StyleSheet.create({ steamOrigin: { transformOrigin: "bottom center" } })
