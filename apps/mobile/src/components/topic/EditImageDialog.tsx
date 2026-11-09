// the sheet that a tap on a topic's or a podcast episode's header image opens.
// it holds only the image block, which saves its own changes

import type { EditableImage } from "@carlnotes/core/components/TopicImageEditor"
import { EDIT_IMAGE_DIALOG_TITLES, toTopicImageEditorKey } from "@carlnotes/core/lib/topicImageEditor"
import { Sheet } from "@/components/common/Sheet"
import { TopicImageEditor } from "./TopicImageEditor"

// the image the sheet edits, the call after each new image is in place, and the close
type EditImageDialogProps = {
	editableImage: EditableImage
	onImageChanged: () => void
	onClose: () => void
}

/**
 * Renders the Edit topic image or Edit podcast image sheet.
 */
export function EditImageDialog({ editableImage, onImageChanged, onClose }: EditImageDialogProps) {
	return (
		<Sheet title={EDIT_IMAGE_DIALOG_TITLES[editableImage.kind]} onClose={onClose}>
			<TopicImageEditor
				key={toTopicImageEditorKey(editableImage)}
				editableImage={editableImage}
				onImageChanged={onImageChanged}
			/>
		</Sheet>
	)
}
