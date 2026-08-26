// steam wisps with the same wavy path and stagger the single mug uses
const STEAM_WISPS = [
	{ x: 11.5, delay: "0ms" },
	{ x: 15, delay: "600ms" },
	{ x: 18.5, delay: "1200ms" },
]

// the single mug's own drawing in its own coordinates, so the pair below is that mug twice over
function CoffeeMug() {
	return (
		<>
			{/* steam */}
			<g stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="opacity-70">
				{STEAM_WISPS.map((wisp) => (
					<path
						key={wisp.x}
						d={`M${wisp.x} 10.5 q-2 -1.6 0 -3.2 q2 -1.6 0 -3.2`}
						className="coffee-mug-steam"
						style={{ animationDelay: wisp.delay }}
					/>
				))}
			</g>
			{/* the cup body with a flat rim and a rounded bottom, drawn once as a faint fill and once as the outline */}
			<path d="M8 13 L8 17 A7 7 0 0 0 22 17 L22 13 Z" fill="currentColor" className="opacity-20" />
			<path d="M8 13 L8 17 A7 7 0 0 0 22 17 L22 13 Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
			{/* mug handle */}
			<path d="M22 15 h2.5 a3 3 0 0 1 0 6 H22" stroke="currentColor" strokeWidth="1.8" />
		</>
	)
}

/**
 * The chat room's icon: the single mug drawn twice, the left one mirrored so the two handles turn outward,
 * and the right one moved clear of it. Each cup keeps the single mug's own size.
 */
export function CoffeeMugs({ className }: { className?: string }) {
	return (
		<svg viewBox="3 3 50 22" width="50" height="22" fill="none" aria-hidden="true" className={className}>
			{/* mirroring about x=32 turns the handle out to the left and puts the cup on the left */}
			<g transform="translate(32, 0) scale(-1, 1)">
				<CoffeeMug />
			</g>
			{/* the drawing moved right so the two cups stand apart */}
			<g transform="translate(24, 0)">
				<CoffeeMug />
			</g>
		</svg>
	)
}
