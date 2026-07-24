// steam wisps with the same wavy path, staggered so they rise in phases
const STEAM_WISPS = [
	{ x: 11.5, delay: "0ms" },
	{ x: 15, delay: "600ms" },
	{ x: 18.5, delay: "1200ms" },
]

/**
 * A coffee-mug icon with steam rising from the cup
 */
export function CoffeeMug({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 32 32" width="26" height="26" fill="none" aria-hidden="true" className={className}>
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
			{/* the cup body with a flat rim and a rounded bottom. the same path is drawn twice, once as a translucent fill and once as the outline */}
			<path d="M8 13 L8 17 A7 7 0 0 0 22 17 L22 13 Z" fill="currentColor" className="opacity-40" />
			<path d="M8 13 L8 17 A7 7 0 0 0 22 17 L22 13 Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
			{/* mug handle */}
			<path d="M22 15 h2.5 a3 3 0 0 1 0 6 H22" stroke="currentColor" strokeWidth="1.8" />
		</svg>
	)
}
