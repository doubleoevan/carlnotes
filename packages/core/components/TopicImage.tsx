// the topic image at one size: the box from the contract, the background until the file loads, the 1x and 2x files,
// and the coffee mug in their place if a file fails to load
import type { TopicImageSize } from "@carlnotes/contracts/enums"
import type { TopicImageUrls } from "@carlnotes/contracts/topicImages"
import { cn } from "@carlnotes/nightshift/classNames"
import { topicImageBoxVariants, topicImageClasses } from "@carlnotes/nightshift/components/topic-image"
import type { ComponentType, ReactNode } from "react"

// the files one size has, which the platform's image element loads at its own density, and what it shows in their
// place if a file fails to load
export type TopicImageFileProps = { url: string; url2x: string; alt: string; className: string; fallback: ReactNode }

// the platform's box, image, and placeholder elements. the box has the contract's classes and the accessible
// name, and the placeholder is the coffee mug a box with no file shows at the size
export type TopicImageElements = {
	Box: ComponentType<{ className: string; label: string; children?: ReactNode }>
	Image: ComponentType<TopicImageFileProps>
	Placeholder: ComponentType<{ size: TopicImageSize }>
}

// the topic's image urls, null while the topic has no image to show, the size to show, the topic's name for the alt
// text, and the classes the placement adds to the box
export type TopicImageProps = {
	image: TopicImageUrls | null
	size: TopicImageSize
	name: string
	className?: string
}

/**
 * Shows a topic's image at the size, or the coffee mug on the muted background while the topic has no image to show:
 * its first image is rendering, or its uploaded image is waiting for its check. A file that fails to load, such as a
 * non-public image whose signed url has expired, shows the coffee mug in its place.
 */
export function TopicImage({
	image,
	size,
	name,
	className,
	elements: { Box, Image, Placeholder },
}: TopicImageProps & {
	elements: TopicImageElements
}) {
	// the size's files, which the platform loads at 1x or 2x with the mug as the fallback for a failed load. a failed
	// file keeps the box's name, so the box shows the mug without the loading pulse
	const files = image?.[size] ?? null
	return (
		<Box className={cn(topicImageBoxVariants({ size }), className)} label={files ? `Image of ${name}` : ""}>
			{files ? (
				<Image
					url={files.url}
					url2x={files.url2x}
					alt={`Image of ${name}`}
					className={topicImageClasses.image}
					fallback={<Placeholder size={size} />}
				/>
			) : (
				<Placeholder size={size} />
			)}
		</Box>
	)
}
