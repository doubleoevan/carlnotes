// the web's card grid, and where a card section's count sits over it. the mobile app stacks its cards in one column,
// so its cards always reach the far right and its count stays there

/**
 * The classes of a web card grid: one column on a phone, two from the `sm` width, and three from the `lg` width.
 */
export const CARD_GRID_CLASS = "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"

/**
 * The screen width from which a row of the card grid with this many cards ends short of the far right, so the section's
 * count sits right after its title from that width up: one card from the two columns of `sm`, and two cards on the
 * three columns of `lg`. A full row returns nothing, and the count stays at the far right.
 */
export function toCountBesideTitleFrom(cardCount: number): "sm" | "lg" | undefined {
	if (cardCount < 2) {
		return "sm"
	}
	return cardCount < 3 ? "lg" : undefined
}
