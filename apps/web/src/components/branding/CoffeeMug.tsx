// the coffee mug icon, drawn from Nightshift's coffee mug
import {
	COFFEE_MUG_CUP_PATH,
	COFFEE_MUG_HANDLE_PATH,
	COFFEE_MUG_VIEW_BOX,
	coffeeMugSteamWisps,
	coffeeMugStyle,
	toSteamWispPath,
} from "@carlnotes/nightshift/coffeeMug"

/**
 * A coffee-mug icon with steam rising from the cup.
 */
export function CoffeeMug({ className }: { className?: string }) {
	return (
		<svg viewBox={COFFEE_MUG_VIEW_BOX} width="26" height="26" fill="none" aria-hidden="true" className={className}>
			{/* steam */}
			<g
				stroke="currentColor"
				strokeWidth={coffeeMugStyle.steamStrokeWidth}
				strokeLinecap="round"
				opacity={coffeeMugStyle.steamOpacity}
			>
				{coffeeMugSteamWisps.map((wisp) => (
					<path
						key={wisp.x}
						d={toSteamWispPath(wisp.x)}
						className="coffee-mug-steam"
						style={{ animationDelay: `${wisp.delayMs}ms` }}
					/>
				))}
			</g>
			{/* the cup body, drawn once as a faint fill and once as the outline */}
			<path d={COFFEE_MUG_CUP_PATH} fill="currentColor" opacity={coffeeMugStyle.cupFillOpacity} />
			<path
				d={COFFEE_MUG_CUP_PATH}
				stroke="currentColor"
				strokeWidth={coffeeMugStyle.cupStrokeWidth}
				strokeLinejoin="round"
			/>
			{/* mug handle */}
			<path d={COFFEE_MUG_HANDLE_PATH} stroke="currentColor" strokeWidth={coffeeMugStyle.cupStrokeWidth} />
		</svg>
	)
}
