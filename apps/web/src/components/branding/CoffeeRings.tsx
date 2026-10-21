// staggered delays for the rings
const RING_DELAYS = ["0s", "3.3s", "6.6s"]

/**
 * Ambient coffee rings that expand and fade on staggered delays behind the hero
 */
export function CoffeeRings() {
	return (
		<div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
			{RING_DELAYS.map((delay) => (
				<span key={delay} className="coffee-ring" style={{ animationDelay: delay }} />
			))}
		</div>
	)
}
