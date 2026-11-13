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
 * The classes both apps draw on a TopicImage's box: the muted background that shows until the file loads and pulses
 * while a topic's first image renders, and each size's pixels and corner. the page size fills its column at 3:2, so a
 * card and the topic page header size it by their width, and it keeps a card's round corner. the list and thumbnail
 * sizes keep a slight corner, which leaves whole the paper edge an image is drawn with
 */
export const topicImageBoxVariants = cva("shrink-0 overflow-hidden bg-muted", {
	variants: {
		size: {
			page: "aspect-[3/2] w-full rounded-lg",
			list: "h-20 w-30 rounded-xs",
			thumbnail: "h-8 w-12 rounded-xs",
		},
	},
	defaultVariants: { size: "page" },
})

/**
 * The classes both apps draw on the image inside the box, which fills the box and crops to it, and on the frame a page
 * header, a Topics row, or the Topic roast sheet puts around the box: a card's border and shadow, at the corner the
 * box's size already has.
 */
export const topicImageClasses = {
	image: "size-full object-cover",
	frame: "shrink-0 border border-separator shadow-raised",
}
