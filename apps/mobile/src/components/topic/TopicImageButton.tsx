// a topic's or a podcast episode's image as a button, and the page header's image, which is that button for an editor.
// a phone has no hover, so the camera shows in the corner at all times

import type { TopicImageProps } from "@carlnotes/core/components/TopicImage"
import { Camera } from "lucide-react-native"
import { Pressable, View } from "react-native"
import { SkeletonPulse } from "@/components/common/SkeletonPulse"
import { Icon } from "@/components/primitives/icon"
import { TopicImage } from "@/components/primitives/topic-image"
import { HEADER_TOPIC_IMAGE_CLASS } from "@/topicImageClasses"

// the image, the button's accessible label, whether it is disabled or pulsing for a render under way, its press, and
// the button's layout classes
type TopicImageButtonProps = Omit<TopicImageProps, "className"> & {
	label: string
	isDisabled?: boolean
	isRendering?: boolean
	onPress: () => void
	className?: string
}

/**
 * Renders the image inside a button with a camera in its corner.
 */
export function TopicImageButton({
	label,
	isDisabled,
	isRendering,
	onPress,
	className,
	...topicImageProps
}: TopicImageButtonProps) {
	return (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel={label}
			disabled={isDisabled}
			onPress={onPress}
			className={className}
		>
			{/* a render under way pulses the empty frame */}
			{isRendering ? (
				<SkeletonPulse>
					<TopicImage {...topicImageProps} className="w-full" />
				</SkeletonPulse>
			) : (
				<TopicImage {...topicImageProps} className="w-full" />
			)}
			<View className="absolute right-2 bottom-2 size-9 items-center justify-center rounded-full bg-black/55">
				<Icon as={Camera} className="size-5 text-white" />
			</View>
		</Pressable>
	)
}

// the image, and for an editor, the button's label and the press that opens the image sheet
type TopicHeaderImageProps = Pick<TopicImageProps, "image" | "name"> & { editLabel: string; onEdit?: () => void }

/**
 * Renders a topic screen's or a podcast episode screen's header image, as the image button if the user may edit it.
 */
export function TopicHeaderImage({ image, name, editLabel, onEdit }: TopicHeaderImageProps) {
	if (!onEdit) {
		return <TopicImage image={image} size="page" name={name} className={HEADER_TOPIC_IMAGE_CLASS} />
	}
	return (
		<TopicImageButton
			image={image}
			size="page"
			name={name}
			label={editLabel}
			onPress={onEdit}
			className={HEADER_TOPIC_IMAGE_CLASS}
		/>
	)
}
