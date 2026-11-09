// the Edit podcast sheet: the title, the description, the image block, then Cancel and Save.
// image changes save on their own

import { PODCAST_EPISODE_DESCRIPTION_MAX_CHARS, PODCAST_EPISODE_TITLE_MAX_CHARS } from "@carlnotes/contracts/podcast"
import { usePodcastEpisodeFields } from "@carlnotes/core/hooks/usePodcastEpisodeFields"
import {
	EDIT_PODCAST_EPISODE_LABEL,
	PODCAST_EPISODE_DESCRIPTION_LABEL,
	PODCAST_EPISODE_TITLE_LABEL,
	type PodcastEpisodeEditorPage,
	toPodcastEpisodeEditableImage,
} from "@carlnotes/core/lib/podcastEpisodeEditor"
import { TOPIC_IMAGE_LABEL, toTopicImageEditorKey } from "@carlnotes/core/lib/topicImageEditor"
import { View } from "react-native"
import { Sheet } from "@/components/common/Sheet"
import { Button } from "@/components/primitives/button"
import { Text } from "@/components/primitives/text"
import { SessionTextInput } from "@/components/session/SessionTextInput"
import { TopicImageEditor } from "@/components/topic/TopicImageEditor"

// the podcast episode's page, the reload after a save or a new image, and the close
type EditPodcastEpisodeDialogProps = {
	podcastEpisodePage: PodcastEpisodeEditorPage
	onPodcastEpisodeChanged: () => void
	onClose: () => void
}

/**
 * Renders the Edit podcast sheet. Save sends the title and description and closes the sheet.
 */
export function EditPodcastEpisodeDialog({
	podcastEpisodePage,
	onPodcastEpisodeChanged,
	onClose,
}: EditPodcastEpisodeDialogProps) {
	// the fields, and the image the block edits
	const fields = usePodcastEpisodeFields({
		podcastEpisode: podcastEpisodePage.podcastEpisode,
		onPodcastEpisodeSaved: () => {
			onPodcastEpisodeChanged()
			onClose()
		},
	})
	const editableImage = toPodcastEpisodeEditableImage(podcastEpisodePage)

	return (
		<Sheet title={EDIT_PODCAST_EPISODE_LABEL} onClose={onClose}>
			<View className="gap-4">
				{/* the title and the description */}
				<SessionTextInput
					label={PODCAST_EPISODE_TITLE_LABEL}
					value={fields.title}
					onChangeText={fields.setTitle}
					maxLength={PODCAST_EPISODE_TITLE_MAX_CHARS}
					className={fields.isTitleMissing ? "border-destructive" : undefined}
				/>
				<SessionTextInput
					label={PODCAST_EPISODE_DESCRIPTION_LABEL}
					multiline
					className="min-h-20"
					value={fields.description}
					onChangeText={fields.setDescription}
					maxLength={PODCAST_EPISODE_DESCRIPTION_MAX_CHARS}
				/>
				{/* the image block. its changes save on their own */}
				<View className="gap-2">
					<Text className="text-sm font-medium">{TOPIC_IMAGE_LABEL}</Text>
					<TopicImageEditor
						key={toTopicImageEditorKey(editableImage)}
						editableImage={editableImage}
						onImageChanged={onPodcastEpisodeChanged}
					/>
				</View>
				{/* the footer actions */}
				<View className="flex-row justify-end gap-2">
					<Button variant="outline" accessibilityLabel="Cancel" disabled={fields.isSaving} onPress={onClose}>
						<Text>Cancel</Text>
					</Button>
					<Button
						accessibilityLabel="Save podcast"
						disabled={fields.isSaving}
						onPress={() => void fields.savePodcastEpisode()}
					>
						<Text>{fields.isSaving ? "Saving…" : "Save"}</Text>
					</Button>
				</View>
			</View>
		</Sheet>
	)
}
