// the sheet that a tap on a topic's or a podcast episode's header image opens: the image block alone, whose changes
// save on their own

import type { TopicImageEditorSubject } from "@carlnotes/core/components/TopicImageEditor"
import { EDIT_IMAGE_DIALOG_TITLES, toTopicImageEditorKey } from "@carlnotes/core/lib/topicImageEditor"
import { Sheet } from "@/components/common/Sheet"
import { TopicImageEditor } from "./TopicImageEditor"

// the image the sheet edits, the call after each new image is in place, and the close
type EditImageDialogProps = {
	subject: TopicImageEditorSubject
	onImageChanged: () => void
	onClose: () => void
}

/**
 * Renders the Edit topic image or Edit podcast image sheet.
 */
export function EditImageDialog({ subject, onImageChanged, onClose }: EditImageDialogProps) {
	return (
		<Sheet title={EDIT_IMAGE_DIALOG_TITLES[subject.kind]} onClose={onClose}>
			<TopicImageEditor key={toTopicImageEditorKey(subject)} subject={subject} onImageChanged={onImageChanged} />
		</Sheet>
	)
}
