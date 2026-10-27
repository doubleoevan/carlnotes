import {
	COFFEE_CUP_FILL,
	COFFEE_CUP_VIEW_BOX,
	coffeeCupPaths,
	coffeeCupSteamWisps,
	toCoffeeCupSteamPath,
} from "@carlnotes/nightshift/coffeeCup"
import { G, Path } from "react-native-svg"
import { ClassNameSvg } from "@/components/common/ClassNameSvg"
import { useFontScaledSize } from "@/hooks/useFontScaledSize"

/**
 * Draws the web's cup and saucer from Nightshift's shared paths.
 */
export function CoffeeCup({ className, size: baseSize = 22 }: { className?: string; size?: number }) {
	const size = useFontScaledSize(baseSize)
	return (
		<ClassNameSvg
			viewBox={COFFEE_CUP_VIEW_BOX}
			width={size}
			height={size}
			fill="none"
			className={className}
			accessible={false}
		>
			{/* hold the steam still at phone widths, matching the web's reduced-motion rule */}
			<G stroke={COFFEE_CUP_FILL} strokeWidth={1.6} strokeLinecap="round" opacity={0.9}>
				{coffeeCupSteamWisps.map((wisp) => (
					<Path key={wisp.x} d={toCoffeeCupSteamPath(wisp.x)} />
				))}
			</G>
			{coffeeCupPaths.map((path) => (
				<Path key={path.d} {...path} stroke="currentColor" strokeLinejoin="round" />
			))}
		</ClassNameSvg>
	)
}
