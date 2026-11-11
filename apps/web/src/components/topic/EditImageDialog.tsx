// the dialog that holds only the image block, which saves its own changes. a click on a topic's, a podcast episode's,
// or a Topic Post's header image opens it, and the action menu's Edit film opens a film's

import type { EditableImage } from "@carlnotes/core/components/TopicImageEditor"
import {
	EDIT_IMAGE_DIALOG_TITLES,
	TOPIC_IMAGE_LABEL,
	toTopicImageEditorKey,
} from "@carlnotes/core/lib/topicImageEditor"
import { FieldLabel } from "@/components/common/FieldLabel"
import { Dialog, DialogContent, DialogTitle } from "@/components/primitives/dialog"
import { TopicImageEditor } from "./TopicImageEditor"

// the image the dialog edits, the call after each new image is in place, and the close
type EditImageDialogProps = {
	editableImage: EditableImage
	onImageChanged: () => void
	onClose: () => void
}

/**
 * Renders the Edit topic image, Edit podcast image, Edit post image, or Edit film dialog.
 */
export function EditImageDialog({ editableImage, onImageChanged, onClose }: EditImageDialogProps) {
	return (
		<Dialog open onOpenChange={(isOpen) => !isOpen && onClose()}>
			<DialogContent aria-describedby={undefined} className="[&>*]:min-w-0">
				<DialogTitle>{EDIT_IMAGE_DIALOG_TITLES[editableImage.kind]}</DialogTitle>
				{/* the image block, under the Image label in a film's dialog, whose title names the film */}
				<div>
					{editableImage.kind === "topicPodcastEpisodeVideo" && <FieldLabel>{TOPIC_IMAGE_LABEL}</FieldLabel>}
					<TopicImageEditor
						key={toTopicImageEditorKey(editableImage)}
						editableImage={editableImage}
						onImageChanged={onImageChanged}
					/>
				</div>
			</DialogContent>
		</Dialog>
	)
}
