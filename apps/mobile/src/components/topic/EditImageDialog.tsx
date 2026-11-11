// the sheet that holds only the image block, which saves its own changes. a tap on a topic's, a podcast episode's, or
// a Topic Post's header image opens it, and the action menu's Edit film opens a film's

import type { EditableImage } from "@carlnotes/core/components/TopicImageEditor"
import {
	EDIT_IMAGE_DIALOG_TITLES,
	TOPIC_IMAGE_LABEL,
	toTopicImageEditorKey,
} from "@carlnotes/core/lib/topicImageEditor"
import { View } from "react-native"
import { Sheet } from "@/components/common/Sheet"
import { Text } from "@/components/primitives/text"
import { TopicImageEditor } from "./TopicImageEditor"

// the image the sheet edits, the call after each new image is in place, and the close
type EditImageDialogProps = {
	editableImage: EditableImage
	onImageChanged: () => void
	onClose: () => void
}

/**
 * Renders the Edit topic image, Edit podcast image, Edit post image, or Edit film sheet.
 */
export function EditImageDialog({ editableImage, onImageChanged, onClose }: EditImageDialogProps) {
	return (
		<Sheet title={EDIT_IMAGE_DIALOG_TITLES[editableImage.kind]} onClose={onClose}>
			{/* the image block, under the Image label in a film's sheet, whose title names the film */}
			<View className="gap-2">
				{editableImage.kind === "topicPodcastEpisodeVideo" && (
					<Text className="text-sm font-medium">{TOPIC_IMAGE_LABEL}</Text>
				)}
				<TopicImageEditor
					key={toTopicImageEditorKey(editableImage)}
					editableImage={editableImage}
					onImageChanged={onImageChanged}
				/>
			</View>
		</Sheet>
	)
}
