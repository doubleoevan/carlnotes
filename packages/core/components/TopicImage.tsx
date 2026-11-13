// the topic image at one size: the box from the contract, the background until the file loads, and the 1x and 2x files
import type { TopicImageSize } from "@carlnotes/contracts/enums"
import type { TopicImageUrls } from "@carlnotes/contracts/topicImages"
import { cn } from "@carlnotes/nightshift/classNames"
import { topicImageBoxVariants, topicImageClasses } from "@carlnotes/nightshift/components/topic-image"
import type { ComponentType, ReactNode } from "react"

// the files one size has, which the platform's image element loads at its own density
export type TopicImageFileProps = { url: string; url2x: string; alt: string; className: string }

// the platform's box and image elements. the box carries the contract's classes and the accessible name
export type TopicImageElements = {
	Box: ComponentType<{ className: string; label: string; children?: ReactNode }>
	Image: ComponentType<TopicImageFileProps>
}

// the topic's image urls, null until its first render lands, the size to show, the topic's name for the alt text,
// and the classes the placement adds to the box
export type TopicImageProps = {
	image: TopicImageUrls | null
	size: TopicImageSize
	name: string
	className?: string
}

/**
 * Shows a topic's image at the size, or the muted background while its first image renders.
 */
export function TopicImage({
	image,
	size,
	name,
	className,
	elements: { Box, Image },
}: TopicImageProps & {
	elements: TopicImageElements
}) {
	// the size's files, which the platform loads at 1x or 2x
	const files = image?.[size] ?? null
	return (
		<Box className={cn(topicImageBoxVariants({ size }), className)} label={files ? `Image of ${name}` : ""}>
			{files && (
				<Image url={files.url} url2x={files.url2x} alt={`Image of ${name}`} className={topicImageClasses.image} />
			)}
		</Box>
	)
}
