// the classes of a topic image in a header row or the Topic roast sheet, matching the web's topic images at phone width
import { cn } from "@carlnotes/nightshift/classNames"
import { TOPIC_IMAGE_FRAME_CLASS } from "@/components/primitives/topic-image"

/**
 * A topic image in a header row: the web's phone width at 3:2, in a card's border and shadow.
 */
export const HEADER_TOPIC_IMAGE_CLASS = cn("w-36 rounded-xs", TOPIC_IMAGE_FRAME_CLASS)

/**
 * A topic image in a Topics row, a step smaller than the page header's, as the web row shows it at phone width, with
 * the slight corner a small image keeps.
 */
export const LIST_TOPIC_IMAGE_CLASS = cn("w-30 rounded-xs", TOPIC_IMAGE_FRAME_CLASS)

/**
 * A topic image at the full width of the Topic roast sheet, in the same border and shadow.
 */
export const SHEET_TOPIC_IMAGE_CLASS = cn("w-full", TOPIC_IMAGE_FRAME_CLASS)
