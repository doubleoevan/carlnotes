import {
	METER_RING_CIRCUMFERENCE,
	METER_RING_RADIUS,
	METER_RING_SIZE,
	METER_RING_STROKE,
	type MeterRingElements,
	type MeterRingProps,
	MeterRing as SharedMeterRing,
} from "@carlnotes/core/components/MeterRing"
import type { ReactNode } from "react"
import { View } from "react-native"
import { Circle } from "react-native-svg"
import { ClassNameSvg } from "@/components/common/ClassNameSvg"
import { Text } from "@/components/primitives/text"
import { useFontScaledSize } from "@/hooks/useFontScaledSize"

/**
 * Renders the web's meter ring in native elements.
 */
export function MeterRing(props: MeterRingProps) {
	return <SharedMeterRing {...props} elements={METER_RING_ELEMENTS} />
}

// the ring's box, its svgs, and the text centered over it
const METER_RING_ELEMENTS: MeterRingElements = {
	Frame: MeterRingFrame,
	Ring: MeterRingSvg,
	Center: ({ children }) => (
		<View
			accessibilityElementsHidden
			importantForAccessibility="no-hide-descendants"
			className="absolute inset-0 items-center justify-center"
		>
			{children}
		</View>
	),
	CenterText: ({ children }) => <Text className="text-sm font-semibold tabular-nums">{children}</Text>,
	CenterSubtext: ({ children }) => <Text className="text-[10px] text-muted-foreground">{children}</Text>,
}

// the ring's square box, grown with the system text size so its text stays inside
function MeterRingFrame({ ariaLabel, children }: { ariaLabel: string; children: ReactNode }) {
	const size = useFontScaledSize(METER_RING_SIZE)
	return (
		<View accessible accessibilityRole="image" accessibilityLabel={ariaLabel} style={{ width: size, height: size }}>
			{children}
		</View>
	)
}

// the track and the arc in two stacked svgs, each colored by its className, with the arc turned to start at the top
function MeterRingSvg({ arcDashOffset }: { arcDashOffset: number | null }) {
	// the svgs' size grown with the frame and the ring's center in svg units
	const size = useFontScaledSize(METER_RING_SIZE)
	const center = METER_RING_SIZE / 2
	const viewBox = `0 0 ${METER_RING_SIZE} ${METER_RING_SIZE}`
	return (
		<>
			<ClassNameSvg width={size} height={size} viewBox={viewBox} className="text-muted" accessible={false}>
				<Circle
					cx={center}
					cy={center}
					r={METER_RING_RADIUS}
					fill="none"
					stroke="currentColor"
					strokeWidth={METER_RING_STROKE}
				/>
			</ClassNameSvg>
			{arcDashOffset !== null && (
				<ClassNameSvg
					width={size}
					height={size}
					viewBox={viewBox}
					className="text-primary"
					style={{ position: "absolute", top: 0, left: 0 }}
					accessible={false}
				>
					<Circle
						cx={center}
						cy={center}
						r={METER_RING_RADIUS}
						fill="none"
						stroke="currentColor"
						strokeWidth={METER_RING_STROKE}
						strokeLinecap="round"
						strokeDasharray={METER_RING_CIRCUMFERENCE}
						strokeDashoffset={arcDashOffset}
						transform={`rotate(-90 ${center} ${center})`}
					/>
				</ClassNameSvg>
			)}
		</>
	)
}
