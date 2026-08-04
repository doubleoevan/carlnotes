// steam wisps sharing one wavy path, staggered so they rise in phases
const STEAM_WISPS = [
	{ x: 9.5, delay: "0ms" },
	{ x: 13.5, delay: "600ms" },
	{ x: 17.5, delay: "1200ms" },
]

/**
 * A coffee cup on a saucer with steam rising, in the ☕️ emoji's pose. The cup and saucer are white with a
 * currentColor outline, so the caller's text color draws the outline, and the cup is always white.
 */
export function CoffeeCup({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 32 32" width="26" height="26" fill="none" aria-hidden="true" className={className}>
			{/* steam, white so it stays brighter than the outline */}
			<g stroke="#fff" strokeWidth="1.6" strokeLinecap="round" className="opacity-90">
				{STEAM_WISPS.map((wisp) => (
					<path
						key={wisp.x}
						d={`M${wisp.x} 12.5 q-2 -1.6 0 -3.2 q2 -1.6 0 -3.2`}
						className="coffee-mug-steam"
						style={{ animationDelay: wisp.delay }}
					/>
				))}
			</g>
			{/* the saucer first, so the bottom of the cup sits over it */}
			<path
				d="M4 25.5 a9.5 2.4 0 0 0 19 0 Z"
				fill="#fff"
				stroke="currentColor"
				strokeWidth="1.4"
				strokeLinejoin="round"
			/>
			{/* cup handle, drawn before the bowl so the bowl's fill covers the joint */}
			<path d="M20 16 h2.3 a2.9 2.9 0 0 1 0 5.8 h-1.6" stroke="currentColor" strokeWidth="1.8" />
			{/* the white-filled cup bowl with its outline */}
			<path
				d="M7 15 L7.6 20.5 A6 6 0 0 0 19.4 20.5 L20 15 Z"
				fill="#fff"
				stroke="currentColor"
				strokeWidth="1.8"
				strokeLinejoin="round"
			/>
		</svg>
	)
}
