// the web implementation of the Nightshift TopicImage: the contract's box as a span, the file as an img that names
// its 1x and 2x files so the browser picks one for its screen, and the coffee mug a box with no file shows
import {
	TopicImage as SharedTopicImage,
	type TopicImageElements,
	type TopicImageFileProps,
	type TopicImageProps,
} from "@carlnotes/core/components/TopicImage"
import { topicImageClasses, topicImagePlaceholderMugHeights } from "@carlnotes/nightshift/components/topic-image"
import { CoffeeMug } from "@/components/branding/CoffeeMug"
import { useSiteAssetUrl } from "@/hooks/useSiteAssetUrl"

// the browser elements: the box is a span, an image with its name when a file is in it and a pulse when none is, the
// file an img with both densities, and the placeholder the coffee mug centered in the box at the contract's share
// of its height
const ELEMENTS: TopicImageElements = {
	Box: ({ className, label, children }) =>
		label ? (
			<span role="img" aria-label={label} className={`relative block ${className}`}>
				{children}
			</span>
		) : (
			<span className={`relative block animate-pulse motion-reduce:animate-none ${className}`}>{children}</span>
		),
	Image: ({ url, url2x, alt }) => (
		<TopicImageFile url={url} url2x={url2x} alt={alt} className={topicImageClasses.image} />
	),
	Placeholder: ({ size }) => (
		<span className={`flex ${topicImageClasses.placeholder}`}>
			<span className="aspect-square" style={{ height: `${topicImagePlaceholderMugHeights[size] * 100}%` }}>
				<CoffeeMug className={`size-full ${topicImageClasses.placeholderMug}`} />
			</span>
		</span>
	),
}

// the img, with its urls resolved against the connected site in an embedded host
function TopicImageFile({ url, url2x, alt, className }: TopicImageFileProps) {
	const siteUrl = useSiteAssetUrl(url)
	const siteUrl2x = useSiteAssetUrl(url2x)
	return <img src={siteUrl} srcSet={`${siteUrl} 1x, ${siteUrl2x} 2x`} alt={alt} loading="lazy" className={className} />
}

/**
 * Shows a topic's image at a size in the browser, or the coffee mug on the pulsing muted background while the topic
 * has no image to show.
 */
export function TopicImage(props: TopicImageProps) {
	return <SharedTopicImage {...props} elements={ELEMENTS} />
}

/**
 * The contract's frame around a topic image in a page header, a Topics row, or the Topic roast popover: a card's border
 * and shadow at the image's corners. The caller adds the width.
 */
export const TOPIC_IMAGE_FRAME_CLASS = topicImageClasses.frame
