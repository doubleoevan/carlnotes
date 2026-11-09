// the TopicImage contract: the box each size draws, the background that shows until the file loads, and the file's fit.
// each app's implementation adds the image element only its platform has
import { cva } from "class-variance-authority"
import type { ComponentPlatform } from "../componentPlatforms"

/**
 * The apps that keep an implementation of TopicImage.
 * @public scripts/check-component-parity.ts reads it through a dynamic import of each contract file.
 */
export const platforms: ComponentPlatform[] = ["web", "mobile"]

/**
 * The classes both apps draw on a TopicImage's box: the round corner, the muted background that shows until the file
 * loads and stays for a topic with no image, and each size's pixels. the page size fills its column at 3:2, so a card
 * and the topic page header size it by their width
 */
export const topicImageBoxVariants = cva("shrink-0 overflow-hidden rounded-lg bg-muted", {
	variants: {
		size: {
			page: "aspect-[3/2] w-full",
			list: "h-20 w-30",
			thumbnail: "h-8 w-12",
		},
	},
	defaultVariants: { size: "page" },
})

/**
 * The classes both apps draw on the image inside the box, which fills the box and crops to it, and on the frame a page
 * header, a Topics row, or the Topic roast sheet puts around the box: a card's border and shadow at the box's corners.
 */
export const topicImageClasses = {
	image: "size-full object-cover",
	frame: "shrink-0 rounded-lg border border-separator shadow-raised",
}
