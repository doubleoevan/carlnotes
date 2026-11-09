// the Card contract: the raised surface a topic card, a podcast episode card, and the home's sections sit on. each
// app's implementation adds the container element only its platform has
import type { ComponentPlatform } from "../componentPlatforms"

/**
 * The apps that keep an implementation of Card.
 * @public scripts/check-component-parity.ts reads it through a dynamic import of each contract file.
 */
export const platforms: ComponentPlatform[] = ["web", "mobile"]

/**
 * The classes both apps draw on a Card: the card fill, the separator border, the round corner, the raised shadow, and
 * the clip that keeps an image inside the corner. the body is the padded column inside it
 */
export const cardClasses = {
	root: "overflow-hidden rounded-lg border border-separator bg-card shadow-raised",
	body: "gap-2 p-3",
}
