// a topic image that opens the page of what it shows when pressed, and stays a plain image on that page itself
import { cn } from "@carlnotes/nightshift/classNames"
import type { ComponentType, ReactNode } from "react"
import type { TopicImageProps } from "./TopicImage"

// the image, the path of the page it opens, the link's name where no title beside the image opens that page, the
// classes that place the link, and what a press does besides opening the page, such as closing a popup
export type TopicImageLinkProps = TopicImageProps & {
	path: string
	label?: string
	linkClassName?: string
	onOpen?: () => void
}

// each app's topic image and the link around it. a link with no label is for a pointer or a touch alone, and the
// title beside the image is the keyboard's and the screen reader's link to the page
export type TopicImageLinkElements = {
	TopicImage: ComponentType<TopicImageProps>
	Link: ComponentType<{
		path: string
		label: string | null
		className?: string
		onOpen?: () => void
		children: ReactNode
	}>
}

/**
 * Shows a topic image inside a link to its page, or the plain image if that page is the one open.
 */
export function TopicImageLink({
	path,
	label,
	linkClassName,
	onOpen,
	isCurrentPage,
	elements: { TopicImage, Link },
	...topicImageProps
}: TopicImageLinkProps & {
	// whether the image's page is the page that is open
	isCurrentPage: boolean
	elements: TopicImageLinkElements
}) {
	// the open page's own image opens nothing, and takes the link's place in the layout
	if (isCurrentPage) {
		return <TopicImage {...topicImageProps} className={cn(topicImageProps.className, linkClassName)} />
	}
	return (
		<Link path={path} label={label ?? null} className={linkClassName} onOpen={onOpen}>
			<TopicImage {...topicImageProps} />
		</Link>
	)
}
