// a topic's or a podcast episode's image as a button with a camera overlay on hover or keyboard focus.
// the page header's image is that button for an editor

import type { TopicImageProps } from "@carlnotes/core/components/TopicImage"
import { cn } from "@carlnotes/nightshift/classNames"
import { Camera } from "lucide-react"
import { TOPIC_IMAGE_FRAME_CLASS, TopicImage } from "@/components/primitives/topic-image"
import { HEADER_TOPIC_IMAGE_CLASS, TOPIC_HEADER_AREA_CLASSES } from "@/lib/pageHeaderClasses"

// the image, the button's accessible label, whether it is disabled, its click, the button's layout classes, and the
// image's own classes inside its frame
type TopicImageButtonProps = Omit<TopicImageProps, "className"> & {
	label: string
	isDisabled?: boolean
	onClick: () => void
	className?: string
	imageClassName?: string
}

/**
 * Renders the image inside a button that shows a camera over it on hover or keyboard focus.
 */
export function TopicImageButton({
	label,
	isDisabled,
	onClick,
	className,
	imageClassName,
	...topicImageProps
}: TopicImageButtonProps) {
	return (
		<button
			type="button"
			aria-label={label}
			disabled={isDisabled}
			onClick={onClick}
			className={cn("group relative cursor-pointer rounded-lg disabled:cursor-default", className)}
		>
			{/* the image and the hover cover take the button's corner */}
			<TopicImage
				{...topicImageProps}
				className={cn(TOPIC_IMAGE_FRAME_CLASS, "w-full rounded-[inherit]", imageClassName)}
			/>
			<span className="absolute inset-0 grid place-items-center rounded-[inherit] bg-black/55 opacity-0 transition-opacity group-enabled:group-hover:opacity-100 group-enabled:group-focus-visible:opacity-100">
				<Camera className="size-6 text-white" />
			</span>
		</button>
	)
}

// the header image's place in the topic header grid, at the header's size
const HEADER_IMAGE_CLASS = cn(TOPIC_HEADER_AREA_CLASSES.image, HEADER_TOPIC_IMAGE_CLASS)

// the image, and for an editor, the button's label and the click that opens the image dialog
type TopicHeaderImageProps = Pick<TopicImageProps, "image" | "name"> & { editLabel: string; onEdit?: () => void }

/**
 * Renders a topic page's or a podcast episode page's header image, as the image button if the user may edit it.
 */
export function TopicHeaderImage({ image, name, editLabel, onEdit }: TopicHeaderImageProps) {
	if (!onEdit) {
		return (
			<TopicImage image={image} size="page" name={name} className={cn(HEADER_IMAGE_CLASS, TOPIC_IMAGE_FRAME_CLASS)} />
		)
	}
	return (
		<TopicImageButton
			image={image}
			size="page"
			name={name}
			label={editLabel}
			onClick={onEdit}
			className={HEADER_IMAGE_CLASS}
		/>
	)
}
