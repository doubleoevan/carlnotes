// the controls only a Topic Post's toolbar has on the phone: the Image button's picker menu with each
// upload's preview and spinner, and the alignment of the paragraphs at the caret. the native editor keeps no code block
// language, alt text, or image place, so none has a control
import { TOPIC_POST_BODY_IMAGE_ACCEPT } from "@carlnotes/contracts/attachmentTypes"
import type { TopicPostAlign } from "@carlnotes/contracts/topicPostBodyImages"
import type { TopicPostBodyControlsProps } from "@carlnotes/core/components/TopicPostEditor"
import {
	alignTopicPostBody,
	TOPIC_POST_ALIGN_OPTIONS,
	toActiveTopicPostAlign,
} from "@carlnotes/core/lib/topicPostAlignment"
import { TOPIC_POST_LABELS } from "@carlnotes/core/lib/topicPosts"
import { cn } from "@carlnotes/nightshift/classNames"
import { AlignCenter, AlignLeft, AlignRight, ImagePlus, type LucideIcon } from "lucide-react-native"
import { ActivityIndicator, Image, View } from "react-native"
import { useFilePicker } from "@/components/common/FilePickerMenu"
import { Button } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"

// each alignment button's icon
const ALIGN_ICONS: Record<TopicPostAlign, LucideIcon> = {
	left: AlignLeft,
	center: AlignCenter,
	right: AlignRight,
}

/**
 * Renders the Image button, the uploads on their way, and the alignment buttons.
 */
export function TopicPostBodyControls({
	editorRef,
	formatState,
	previewUris,
	isImageBlocked,
	onPickImages,
}: TopicPostBodyControlsProps) {
	// the images picked from the library, the camera, or files go up by their local file uris
	const { openFilePicker, filePickerMenu, isPicking, triggerRef } = useFilePicker({
		accept: TOPIC_POST_BODY_IMAGE_ACCEPT,
		isMultiple: true,
		onPicked: (pickedFiles) => onPickImages(pickedFiles.map(({ uri, mimeType }) => ({ uri, type: mimeType }))),
	})
	return (
		<>
			{/* the Image button and its picker menu */}
			<Button
				ref={triggerRef}
				variant="ghost"
				size="icon"
				className="min-h-12 min-w-12"
				accessibilityLabel={TOPIC_POST_LABELS.addImage}
				disabled={isImageBlocked || isPicking}
				onPress={openFilePicker}
			>
				<Icon as={ImagePlus} className="size-4" />
			</Button>
			{filePickerMenu}

			{/* each upload's preview under a spinner until it lands or fails */}
			{previewUris.map((previewUri) => (
				<View
					key={previewUri}
					accessibilityLabel={TOPIC_POST_LABELS.imageUploading}
					className="size-8 items-center justify-center overflow-hidden rounded-sm border border-border"
				>
					<Image source={{ uri: previewUri }} className="absolute size-full opacity-60" />
					<ActivityIndicator size="small" />
				</View>
			))}

			{/* the alignment of the paragraphs at the caret */}
			{TOPIC_POST_ALIGN_OPTIONS.map(({ align, label }) => {
				const isPressed = toActiveTopicPostAlign(formatState) === align
				return (
					<Button
						key={align}
						variant="ghost"
						size="icon"
						className={cn("min-h-12 min-w-12", isPressed && "bg-accent")}
						accessibilityLabel={label}
						accessibilityState={{ selected: isPressed }}
						onPress={() => editorRef.current && alignTopicPostBody(editorRef.current, formatState, align)}
					>
						<Icon as={ALIGN_ICONS[align]} className="size-4" />
					</Button>
				)
			})}
		</>
	)
}
