import type { ComponentType, ReactNode } from "react"

// a ring's size and stroke in svg units and the length of its circle
export const METER_RING_SIZE = 88
export const METER_RING_STROKE = 6
export const METER_RING_RADIUS = (METER_RING_SIZE - METER_RING_STROKE) / 2
export const METER_RING_CIRCUMFERENCE = 2 * Math.PI * METER_RING_RADIUS

type Container = ComponentType<{ children: ReactNode }>
export type MeterRingElements = {
	// the ring's square box with its screen reader name
	Frame: ComponentType<{ ariaLabel: string; children: ReactNode }>
	// the track and the arc from the top clockwise. a null dash offset draws no arc
	Ring: ComponentType<{ arcDashOffset: number | null }>
	// the centered text over the ring
	Center: Container
	CenterText: Container
	CenterSubtext: Container
}

export type MeterRingProps = {
	// the arc's share of the ring from 0 to 1. a share past 1 draws a full ring
	share: number
	centerText: string
	centerSubtext?: string
	ariaLabel: string
}

/**
 * Composes a ring with an arc for a share and its text inside it for both apps.
 */
export function MeterRing({
	share,
	centerText,
	centerSubtext,
	ariaLabel,
	elements: { Frame, Ring, Center, CenterText, CenterSubtext },
}: MeterRingProps & { elements: MeterRingElements }) {
	// the arc's dash offset with the share kept between empty and full. an empty share draws no arc so no round end
	// shows as a dot
	const clampedShare = Math.min(1, Math.max(0, share))
	const arcDashOffset = clampedShare > 0 ? METER_RING_CIRCUMFERENCE * (1 - clampedShare) : null
	return (
		<Frame ariaLabel={ariaLabel}>
			<Ring arcDashOffset={arcDashOffset} />
			<Center>
				<CenterText>{centerText}</CenterText>
				{centerSubtext && <CenterSubtext>{centerSubtext}</CenterSubtext>}
			</Center>
		</Frame>
	)
}
