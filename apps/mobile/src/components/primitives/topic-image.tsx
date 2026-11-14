// the mobile implementation of the Nightshift TopicImage: the contract's box as a View, the file through expo-image
// at the 2x size, and the coffee mug a box with no file shows. an unchecked image's file loads with the session and is
// never stored

import type { TopicImageSize } from "@carlnotes/contracts/enums"
import {
	TopicImage as SharedTopicImage,
	type TopicImageElements,
	type TopicImageFileProps,
	type TopicImageProps,
} from "@carlnotes/core/components/TopicImage"
import { topicImageClasses, topicImagePlaceholderMugHeights } from "@carlnotes/nightshift/components/topic-image"
import { Image } from "expo-image"
import { useState } from "react"
import { View } from "react-native"
import { CoffeeMug } from "@/components/branding/CoffeeMug"
import { SkeletonPulse } from "@/components/common/SkeletonPulse"
import { useApiImageProps } from "@/hooks/useApiImageProps"

// the mobile elements: the box is a view, an image with its name when a file is in it and a pulse when none is, the
// file an expo-image that fills the contract's image box at 2x, and the placeholder the coffee mug centered in the box
const ELEMENTS: TopicImageElements = {
	Box: ({ className, label, children }) =>
		label ? (
			<View accessibilityRole="image" accessibilityLabel={label} className={className}>
				{children}
			</View>
		) : (
			<SkeletonPulse>
				<View className={className}>{children}</View>
			</SkeletonPulse>
		),
	Image: TopicImageFile,
	Placeholder: TopicImagePlaceholder,
}

// the coffee mug at the contract's share of the box's height, drawn once the box has been measured. the mug follows
// the box's size, so it does not grow again with the system text size
function TopicImagePlaceholder({ size }: { size: TopicImageSize }) {
	const [boxHeight, setBoxHeight] = useState(0)
	return (
		<View className={topicImageClasses.placeholder} onLayout={(event) => setBoxHeight(event.nativeEvent.layout.height)}>
			{boxHeight > 0 && (
				<CoffeeMug
					size={boxHeight * topicImagePlaceholderMugHeights[size]}
					isFontScaled={false}
					className={topicImageClasses.placeholderMug}
				/>
			)}
		</View>
	)
}

// the file at 2x in the contract's image box. an unchecked image's file, at a path only its uploader's session reads,
// loads with the stored session cookie and is never stored
function TopicImageFile({ url2x, alt }: TopicImageFileProps) {
	const imageProps = useApiImageProps(url2x)
	return (
		<View className={topicImageClasses.image}>
			{imageProps && <Image {...imageProps} accessibilityLabel={alt} contentFit="cover" style={{ flex: 1 }} />}
		</View>
	)
}

/**
 * Shows a topic's image at a size on a phone, or the coffee mug on the pulsing muted background while the topic has
 * no image to show.
 */
export function TopicImage(props: TopicImageProps) {
	return <SharedTopicImage {...props} elements={ELEMENTS} />
}

/**
 * The contract's frame around a topic image in a header row, a Topics row, or the Topic roast sheet: a card's border
 * and shadow at the image's corners. The caller adds the width.
 */
export const TOPIC_IMAGE_FRAME_CLASS = topicImageClasses.frame
