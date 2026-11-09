// the dialog that a click on a topic's or a podcast episode's header image opens.
// it holds only the image block, which saves its own changes

import type { EditableImage } from "@carlnotes/core/components/TopicImageEditor"
import { EDIT_IMAGE_DIALOG_TITLES, toTopicImageEditorKey } from "@carlnotes/core/lib/topicImageEditor"
import { Dialog, DialogContent, DialogTitle } from "@/components/primitives/dialog"
import { TopicImageEditor } from "./TopicImageEditor"

// the image the dialog edits, the call after each new image is in place, and the close
type EditImageDialogProps = {
	editableImage: EditableImage
	onImageChanged: () => void
	onClose: () => void
}

/**
 * Renders the Edit topic image or Edit podcast image dialog.
 */
export function EditImageDialog({ editableImage, onImageChanged, onClose }: EditImageDialogProps) {
	return (
		<Dialog open onOpenChange={(isOpen) => !isOpen && onClose()}>
			<DialogContent aria-describedby={undefined} className="[&>*]:min-w-0">
				<DialogTitle>{EDIT_IMAGE_DIALOG_TITLES[editableImage.kind]}</DialogTitle>
				<TopicImageEditor
					key={toTopicImageEditorKey(editableImage)}
					editableImage={editableImage}
					onImageChanged={onImageChanged}
				/>
			</DialogContent>
		</Dialog>
	)
}
