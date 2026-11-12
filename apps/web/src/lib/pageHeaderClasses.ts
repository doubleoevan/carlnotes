// the tailwind class strings of a page header: a topic header's image, grid, and parts, and the avatar header's
// avatar and parts
import { cn } from "@carlnotes/nightshift/classNames"
import { SKELETON_SHAPE_CLASS } from "./styleClasses"

/**
 * A topic image's width in a page header. It is as tall as a podcast episode cover at 3:2, and smaller on a phone.
 */
export const HEADER_TOPIC_IMAGE_CLASS = "w-36 rounded-xs sm:w-54"

// the topic header grid's layouts from sm up, by whether the topic has tags and whether the row has actions: the
// title, the byline, and the tags beside the image. the last row stretches to the image's bottom, and the actions
// end it at the right, at its bottom
const TOPIC_HEADER_GRID_CLASSES = {
	tagsAndActions:
		"sm:grid-rows-[auto_auto_1fr] sm:[grid-template-areas:'image_title_title'_'image_byline_byline'_'image_tags_actions']",
	actions: "sm:grid-rows-[auto_1fr] sm:[grid-template-areas:'image_title_title'_'image_byline_actions']",
	tags: "sm:grid-rows-[auto_auto_1fr] sm:[grid-template-areas:'image_title_title'_'image_byline_byline'_'image_tags_tags']",
	plain: "sm:grid-rows-[auto_1fr] sm:[grid-template-areas:'image_title_title'_'image_byline_byline']",
}

/**
 * Returns a topic header's classes, with the same space above and below as every image header. On a phone the image
 * floats at the left, so the title, the tags, and the byline sit beside it and run under it only once they pass its
 * bottom. From sm up it is a grid with each part in its named area.
 */
export function toTopicHeaderGridClass({ hasTags, hasActions }: { hasTags: boolean; hasActions: boolean }): string {
	const layoutName = hasTags ? (hasActions ? "tagsAndActions" : "tags") : hasActions ? "actions" : "plain"
	return `my-4 flow-root sm:grid sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-start sm:gap-x-4 sm:gap-y-1.5 ${TOPIC_HEADER_GRID_CLASSES[layoutName]}`
}

/**
 * The header grid of a page with an image, a title, and a byline, and no tags or actions: a Topic Post's page and a
 * podcast episode's page, loaded or loading, and a topic page while it loads.
 */
export const PLAIN_TOPIC_HEADER_GRID_CLASS = toTopicHeaderGridClass({ hasTags: false, hasActions: false })

/**
 * The classes of a topic header's parts. On a phone the byline row sits under the image and holds the byline with
 * the actions at its right. From sm up the row uses display: contents, so each child takes its own grid area.
 */
export const TOPIC_HEADER_AREA_CLASSES = {
	image: "float-left mr-4 mb-1.5 [grid-area:image] sm:float-none sm:mr-0 sm:mb-0",
	title: "[grid-area:title] min-w-0",
	tags: "[grid-area:tags] mt-1.5 min-w-0 sm:mt-0",
	bylineRow: "mt-1.5 flex items-center justify-between gap-3 max-sm:clear-left sm:contents",
	byline: "[grid-area:byline] min-w-0",
	actions: "[grid-area:actions] shrink-0 sm:self-end",
}

/**
 * The avatar in a profile's or a team's header, at the height of a topic's image on the Topics page: 5rem on a phone
 * and 6rem from sm up.
 */
export const PAGE_AVATAR_CLASS = "size-20 sm:size-24"

// a page header where the avatar floats at the left and the title always sits beside it. the counts and the
// description flow around the avatar, so each count that no longer fits beside it wraps to the next line, and the
// lines past the avatar continue under it. the title's top padding centers the title and one line of counts on the
// avatar. the avatar's float is a flex box, so the avatar inside it adds no line box under it
export const PAGE_HEADER_FLOW_CLASS = "flow-root"
export const PAGE_HEADER_AVATAR_FLOAT_CLASS = "float-left mr-4 mb-2 flex"
export const PAGE_HEADER_TITLE_CLASS = "flow-root min-w-0 pt-2 sm:pt-5"

// the title alone beside the avatar, with no details line under it, centered on the avatar
export const PAGE_HEADER_LONE_TITLE_CLASS = "flow-root min-w-0 pt-6 sm:pt-8"
export const PAGE_HEADER_DETAILS_CLASS = "mt-1"
export const PAGE_HEADER_DESCRIPTION_CLASS = "mt-1"

// the avatar's placeholder circle where the avatar floats
export const PAGE_AVATAR_SKELETON_CLASS = cn(
	SKELETON_SHAPE_CLASS,
	PAGE_AVATAR_CLASS,
	PAGE_HEADER_AVATAR_FLOAT_CLASS,
	"rounded-full",
)
