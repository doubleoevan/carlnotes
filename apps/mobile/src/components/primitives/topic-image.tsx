// the mobile implementation of the Nightshift TopicImage: the contract's box as a View, and the file through
// expo-image at the 2x size
import { toApiUrl } from "@carlnotes/client/apiClient"
import {
	TopicImage as SharedTopicImage,
	type TopicImageElements,
	type TopicImageProps,
} from "@carlnotes/core/components/TopicImage"
import { topicImageClasses } from "@carlnotes/nightshift/components/topic-image"
import { Image } from "expo-image"
import { View } from "react-native"

// the native elements: the box is a view, an image with its name when a file is in it, and the file an expo-image
// that fills the contract's image box at 2x
const ELEMENTS: TopicImageElements = {
	Box: ({ className, label, children }) =>
		label ? (
			<View accessibilityRole="image" accessibilityLabel={label} className={className}>
				{children}
			</View>
		) : (
			<View className={className} />
		),
	Image: ({ url2x, alt }) => (
		<View className={topicImageClasses.image}>
			<Image source={{ uri: toApiUrl(url2x) }} accessibilityLabel={alt} contentFit="cover" style={{ flex: 1 }} />
		</View>
	),
}

/**
 * Shows a topic's image at a size on a phone, or the muted ground for a topic with no image yet.
 */
export function TopicImage(props: TopicImageProps) {
	return <SharedTopicImage {...props} elements={ELEMENTS} />
}

/**
 * The contract's frame around a topic image in a header row, a Topics row, or the Topic roast sheet: a card's border
 * and shadow at the image's corners. The caller adds the width.
 */
export const TOPIC_IMAGE_FRAME_CLASS = topicImageClasses.frame
