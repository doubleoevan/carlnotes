// the web's topic image link: the image inside the app's link, with the open page read from the router
import {
	TopicImageLink as SharedTopicImageLink,
	type TopicImageLinkElements,
	type TopicImageLinkProps,
} from "@carlnotes/core/components/TopicImageLink"
import { isCurrentPagePath } from "@carlnotes/core/lib/pagePaths"
import { cn } from "@carlnotes/nightshift/classNames"
import { useLocation } from "@tanstack/react-router"
import { AnchorLink } from "@/components/common/AnchorLink"
import { TopicImage } from "@/components/primitives/topic-image"

// the web's elements: the topic image, and the link around it, which dims under the pointer. a link with no label
// keeps out of the tab order and the accessibility tree, and a link with one reads it as its name
const ELEMENTS: TopicImageLinkElements = {
	TopicImage,
	Link: ({ path, label, className, onOpen, children }) => (
		<AnchorLink
			href={path}
			{...(label === null ? { tabIndex: -1, "aria-hidden": true } : { "aria-label": label })}
			onClick={onOpen}
			className={cn("block shrink-0 hover:opacity-75", className)}
		>
			{children}
		</AnchorLink>
	),
}

/**
 * Shows a topic image that opens its page on the web, or the plain image on that page itself.
 */
export function TopicImageLink(props: TopicImageLinkProps) {
	const currentPath = useLocation({ select: (location) => location.pathname })
	return (
		<SharedTopicImageLink
			{...props}
			isCurrentPage={isCurrentPagePath({ path: props.path, currentPath })}
			elements={ELEMENTS}
		/>
	)
}
