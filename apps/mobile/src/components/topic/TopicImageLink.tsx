// the app's topic image link: the image inside the app's link, with the open screen read from the router
import { SITE_URL } from "@carlnotes/contracts/site"
import {
	TopicImageLink as SharedTopicImageLink,
	type TopicImageLinkElements,
	type TopicImageLinkProps,
} from "@carlnotes/core/components/TopicImageLink"
import { isCurrentPagePath } from "@carlnotes/core/lib/pagePaths"
import { cn } from "@carlnotes/nightshift/classNames"
import { usePathname } from "expo-router"
import { AnchorLink } from "@/components/common/AnchorLink"
import { TopicImage } from "@/components/primitives/topic-image"
import { toPlatformPath } from "@/platformPath"

// the app's elements: the topic image, and the link around it, which dims while pressed. the link opens the page's
// site url, which opens in the app if the app has that screen. a link with no label is no accessibility element of
// its own, and a link with one reads it as its name
const ELEMENTS: TopicImageLinkElements = {
	TopicImage,
	Link: ({ path, label, className, onOpen, children }) => (
		<AnchorLink
			href={`${SITE_URL}${path}`}
			accessible={label !== null}
			accessibilityLabel={label ?? ""}
			onPress={onOpen}
			className={cn("shrink-0 active:opacity-75", className)}
		>
			{children}
		</AnchorLink>
	),
}

/**
 * Shows a topic image that opens its screen in the app, or the plain image on that screen itself.
 */
export function TopicImageLink(props: TopicImageLinkProps) {
	const currentPath = usePathname()
	return (
		<SharedTopicImageLink
			{...props}
			isCurrentPage={isCurrentPagePath({ path: toPlatformPath(props.path), currentPath })}
			elements={ELEMENTS}
		/>
	)
}
