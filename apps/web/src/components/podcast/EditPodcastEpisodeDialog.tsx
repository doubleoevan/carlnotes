// the Edit podcast dialog, laid out as the Edit topic dialog: the title, the description, and the image block, whose
// changes save on their own, then Cancel and Save

import { PODCAST_EPISODE_DESCRIPTION_MAX_CHARS, PODCAST_EPISODE_TITLE_MAX_CHARS } from "@carlnotes/contracts/podcast"
import { usePodcastEpisodeFields } from "@carlnotes/core/hooks/usePodcastEpisodeFields"
import {
	EDIT_PODCAST_EPISODE_LABEL,
	PODCAST_EPISODE_DESCRIPTION_LABEL,
	PODCAST_EPISODE_TITLE_LABEL,
	type PodcastEpisodeEditorPage,
	toPodcastEpisodeImageEditorSubject,
} from "@carlnotes/core/lib/podcastEpisodeEditor"
import { TOPIC_IMAGE_LABEL, toTopicImageEditorKey } from "@carlnotes/core/lib/topicImageEditor"
import { cn } from "@carlnotes/nightshift/classNames"
import { useId } from "react"
import { FieldLabel } from "@/components/common/FieldLabel"
import { Button } from "@/components/primitives/button"
import { Dialog, DialogContent, DialogFooter, DialogTitle } from "@/components/primitives/dialog"
import { Input } from "@/components/primitives/input"
import { Textarea } from "@/components/primitives/textarea"
import { TopicImageEditor } from "@/components/topic/TopicImageEditor"

// the podcast episode's page, the reload after a save or a new image, and the close
type EditPodcastEpisodeDialogProps = {
	podcastEpisodePage: PodcastEpisodeEditorPage
	onPodcastEpisodeChanged: () => void
	onClose: () => void
}

/**
 * Renders the Edit podcast dialog. Save sends the title and description and closes the dialog.
 */
export function EditPodcastEpisodeDialog({
	podcastEpisodePage,
	onPodcastEpisodeChanged,
	onClose,
}: EditPodcastEpisodeDialogProps) {
	// the ids that tie each field label to its field, the fields, and the image the block edits
	const titleInputId = useId()
	const descriptionInputId = useId()
	const fields = usePodcastEpisodeFields({
		podcastEpisode: podcastEpisodePage.podcastEpisode,
		onPodcastEpisodeSaved: () => {
			onPodcastEpisodeChanged()
			onClose()
		},
	})
	const imageEditorSubject = toPodcastEpisodeImageEditorSubject(podcastEpisodePage)

	return (
		<Dialog open onOpenChange={(isOpen) => !isOpen && onClose()}>
			<DialogContent aria-describedby={undefined} className="[&>*]:min-w-0">
				<DialogTitle>{EDIT_PODCAST_EPISODE_LABEL}</DialogTitle>

				{/* title */}
				<div>
					<FieldLabel htmlFor={titleInputId} isRequired>
						{PODCAST_EPISODE_TITLE_LABEL}
					</FieldLabel>
					<Input
						id={titleInputId}
						aria-required
						maxLength={PODCAST_EPISODE_TITLE_MAX_CHARS}
						value={fields.title}
						onChange={(event) => fields.setTitle(event.target.value)}
						className={cn(fields.isTitleMissing && "border-destructive")}
					/>
				</div>

				{/* description */}
				<div>
					<FieldLabel htmlFor={descriptionInputId}>{PODCAST_EPISODE_DESCRIPTION_LABEL}</FieldLabel>
					<Textarea
						id={descriptionInputId}
						rows={3}
						maxLength={PODCAST_EPISODE_DESCRIPTION_MAX_CHARS}
						value={fields.description}
						onChange={(event) => fields.setDescription(event.target.value)}
					/>
				</div>

				{/* the image block. its changes save on their own */}
				<div>
					<FieldLabel>{TOPIC_IMAGE_LABEL}</FieldLabel>
					<TopicImageEditor
						key={toTopicImageEditorKey(imageEditorSubject)}
						subject={imageEditorSubject}
						onImageChanged={onPodcastEpisodeChanged}
					/>
				</div>

				{/* the footer actions */}
				<DialogFooter>
					<Button variant="outline" onClick={onClose} disabled={fields.isSaving}>
						Cancel
					</Button>
					<Button onClick={() => void fields.savePodcastEpisode()} disabled={fields.isSaving}>
						Save
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
