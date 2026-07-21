// ring numbers mapped to css classes
const RING_NUMBERS = [1, 2, 3, 4, 5, 6]

/**
 * Rings of coffee steam that grow and fade behind the page
 */
export function CoffeeSteam() {
	return (
		<div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
			{/* each .coffee-steam-<number> class sets its ring's position and size. all but the first also delay the animation so the rings stagger */}
			{RING_NUMBERS.map((ringNumber) => (
				<div key={ringNumber} className={`coffee-steam coffee-steam-${ringNumber}`} />
			))}
		</div>
	)
}
