import {
	METER_RING_CIRCUMFERENCE,
	METER_RING_RADIUS,
	METER_RING_SIZE,
	METER_RING_STROKE,
	type MeterRingElements,
	type MeterRingProps,
	MeterRing as SharedMeterRing,
} from "@carlnotes/core/components/MeterRing"

/**
 * Renders the shared meter ring in DOM elements.
 */
export function MeterRing(props: MeterRingProps) {
	return <SharedMeterRing {...props} elements={METER_RING_ELEMENTS} />
}

// the ring's box, its svg, and the text centered over it
const METER_RING_ELEMENTS: MeterRingElements = {
	Frame: ({ ariaLabel, children }) => (
		<div role="img" aria-label={ariaLabel} className="relative size-22 shrink-0">
			{children}
		</div>
	),
	Ring: MeterRingSvg,
	Center: ({ children }) => (
		<div aria-hidden="true" className="absolute inset-0 flex flex-col items-center justify-center">
			{children}
		</div>
	),
	CenterText: ({ children }) => <span className="text-sm font-semibold tabular-nums">{children}</span>,
	CenterSubtext: ({ children }) => <span className="text-muted-foreground text-[10px]">{children}</span>,
}

// the track and the arc, turned so the arc starts at the top
function MeterRingSvg({ arcDashOffset }: { arcDashOffset: number | null }) {
	return (
		<svg
			aria-hidden="true"
			className="-rotate-90"
			width={METER_RING_SIZE}
			height={METER_RING_SIZE}
			viewBox={`0 0 ${METER_RING_SIZE} ${METER_RING_SIZE}`}
		>
			<circle
				className="stroke-muted"
				cx={METER_RING_SIZE / 2}
				cy={METER_RING_SIZE / 2}
				r={METER_RING_RADIUS}
				fill="none"
				strokeWidth={METER_RING_STROKE}
			/>
			{arcDashOffset !== null && (
				<circle
					className="stroke-primary"
					cx={METER_RING_SIZE / 2}
					cy={METER_RING_SIZE / 2}
					r={METER_RING_RADIUS}
					fill="none"
					strokeWidth={METER_RING_STROKE}
					strokeLinecap="round"
					strokeDasharray={METER_RING_CIRCUMFERENCE}
					strokeDashoffset={arcDashOffset}
				/>
			)}
		</svg>
	)
}
