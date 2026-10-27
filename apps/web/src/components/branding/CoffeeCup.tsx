import {
	COFFEE_CUP_FILL,
	COFFEE_CUP_VIEW_BOX,
	coffeeCupPaths,
	coffeeCupSteamWisps,
	toCoffeeCupSteamPath,
} from "@carlnotes/nightshift/coffeeCup"

/**
 * A coffee cup on a saucer with steam rising, in the ☕️ emoji's pose. The cup and saucer are white with a
 * currentColor outline, so the caller's text color draws the outline, and the cup is always white.
 */
export function CoffeeCup({ className }: { className?: string }) {
	return (
		<svg viewBox={COFFEE_CUP_VIEW_BOX} width="26" height="26" fill="none" aria-hidden="true" className={className}>
			{/* steam, white so it stays brighter than the outline */}
			<g stroke={COFFEE_CUP_FILL} strokeWidth="1.6" strokeLinecap="round" className="opacity-90">
				{coffeeCupSteamWisps.map((wisp) => (
					<path
						key={wisp.x}
						d={toCoffeeCupSteamPath(wisp.x)}
						className="coffee-mug-steam"
						style={{ animationDelay: `${wisp.delayMs}ms` }}
					/>
				))}
			</g>
			{/* draw the saucer, handle, and bowl in the shared order */}
			{coffeeCupPaths.map((path) => (
				<path key={path.d} {...path} stroke="currentColor" strokeLinejoin="round" />
			))}
		</svg>
	)
}
