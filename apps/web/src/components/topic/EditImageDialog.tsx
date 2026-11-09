// the dialog that a click on a topic's or a podcast episode's page image opens: the image block alone, whose changes
// save on their own

import type { TopicImageEditorSubject } from "@carlnotes/core/components/TopicImageEditor"
import { EDIT_IMAGE_DIALOG_TITLES, toTopicImageEditorKey } from "@carlnotes/core/lib/topicImageEditor"
import { Dialog, DialogContent, DialogTitle } from "@/components/primitives/dialog"
import { TopicImageEditor } from "./TopicImageEditor"

// the image the dialog edits, the call after each new image is in place, and the close
type EditImageDialogProps = {
	subject: TopicImageEditorSubject
	onImageChanged: () => void
	onClose: () => void
}

/**
 * Renders the Edit topic image or Edit podcast image dialog.
 */
export function EditImageDialog({ subject, onImageChanged, onClose }: EditImageDialogProps) {
	return (
		<Dialog open onOpenChange={(isOpen) => !isOpen && onClose()}>
			<DialogContent aria-describedby={undefined} className="[&>*]:min-w-0">
				<DialogTitle>{EDIT_IMAGE_DIALOG_TITLES[subject.kind]}</DialogTitle>
				<TopicImageEditor key={toTopicImageEditorKey(subject)} subject={subject} onImageChanged={onImageChanged} />
			</DialogContent>
		</Dialog>
	)
}
