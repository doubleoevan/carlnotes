// the pot is drawn near 48px where the rest of the coffee set is drawn near 20px
const BODY_STROKE = "0.8"
const STEAM_STROKE = "0.65"

// steam wisps with the same wavy path the mug uses, staggered so they rise in phases
const STEAM_WISPS = [
	{ x: 13, delay: "0ms" },
	{ x: 17.5, delay: "700ms" },
]

/**
 * A coffee-pot icon with steam rising from the lid
 */
export function CoffeePot({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 32 32" width="26" height="26" fill="none" aria-hidden="true" className={className}>
			{/* steam */}
			<g stroke="currentColor" strokeWidth={STEAM_STROKE} strokeLinecap="round" className="opacity-70">
				{STEAM_WISPS.map((wisp) => (
					<path
						key={wisp.x}
						d={`M${wisp.x} 8 q-2 -1.6 0 -3.2`}
						className="coffee-mug-steam"
						style={{ animationDelay: wisp.delay }}
					/>
				))}
			</g>
			{/* the lid knob above the rim */}
			<circle cx="15" cy="10.2" r="1.3" fill="currentColor" />
			{/* the tapered pot body with a rounded bottom, drawn twice: a faint fill under the outline */}
			<path
				d="M9.5 12.5 H20.5 L19.5 24 A2.5 2.5 0 0 1 17 26.2 H13 A2.5 2.5 0 0 1 10.5 24 Z"
				fill="currentColor"
				className="opacity-20"
			/>
			<path
				d="M9.5 12.5 H20.5 L19.5 24 A2.5 2.5 0 0 1 17 26.2 H13 A2.5 2.5 0 0 1 10.5 24 Z"
				stroke="currentColor"
				strokeWidth={BODY_STROKE}
				strokeLinejoin="round"
			/>
			{/* the pouring spout off the rim's left corner */}
			<path d="M9.5 12.5 L6.8 15.2 L10 16" stroke="currentColor" strokeWidth={BODY_STROKE} strokeLinejoin="round" />
			{/* the coffee pot handle */}
			<path d="M20.5 15 h2.5 a3 3 0 0 1 0 6 H19.8" stroke="currentColor" strokeWidth={BODY_STROKE} />
		</svg>
	)
}
