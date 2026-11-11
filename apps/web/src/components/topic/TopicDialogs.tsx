import type { PodcastEpisode } from "@carlnotes/contracts/podcast"
import type { TopicResponse } from "@carlnotes/contracts/topics"
import { useTopicPodcastEpisodeVideoEditableImage } from "@carlnotes/core/hooks/useTopicPodcastEpisodeVideoEditableImage"
import { toTopicPageEditedPodcastEpisode } from "@carlnotes/core/lib/podcastEpisodeEditor"
import { type PinnedOrderMove, toHomeRankDialogLabels } from "@carlnotes/core/lib/rankDialog"
import { REQUEST_FAILED_TEXT } from "@carlnotes/core/lib/sessionCopy"
import { toast } from "sonner"
import { ProfileRankDialog, RankDialog } from "@/components/common/RankDialog"
import { ShareTopic } from "@/components/share/ShareTopic"
import { AddTopicToTeamDialog } from "@/components/team/AddTopicToTeamDialog"
import { DeleteTopicDialog } from "./DeleteTopicDialog"
import { EditImageDialog } from "./EditImageDialog"
import { EditTopicModal } from "./EditTopicModal"
import { TopicEditorChoiceDialog } from "./TopicEditorChoiceDialog"

// the topic page's dialogs, one open at a time
export type TopicDialog =
	| "edit-choice"
	| "edit"
	| "edit-film"
	| "edit-image"
	| "make-public"
	| "share"
	| "add-topic-to-team"
	| "rank"
	| "rank-profile"
	| "delete"

/**
 * The topic's dialogs, one at a time. Each mounts only while it is the open one, and its state resets every time.
 */
export function TopicDialogs({
	topic,
	openDialog,
	onOpenDialog,
	onSaveTopic,
	onTopicTeamsChanged,
	onTopicImageChanged,
	onRankTopic,
	onTopicDeleted,
}: {
	topic: TopicResponse
	openDialog: TopicDialog | null
	onOpenDialog: (dialog: TopicDialog | null) => void
	onSaveTopic: () => Promise<void>
	onTopicTeamsChanged: () => void
	// called once each new image is in place
	onTopicImageChanged: () => void
	onRankTopic: (moves: PinnedOrderMove[]) => Promise<void>
	onTopicDeleted: () => Promise<void>
}) {
	// the podcast episode of the topic's latest film, for a user who may edit it
	const editedPodcastEpisode = toTopicPageEditedPodcastEpisode(topic)
	return (
		<>
			{/* the edit option asks form or Carl first. the form choice opens the modal in its place */}
			{openDialog === "edit-choice" && (
				<TopicEditorChoiceDialog
					topicId={topic.id}
					onChooseTopicForm={() => onOpenDialog("edit")}
					onClose={() => onOpenDialog(null)}
				/>
			)}
			{(openDialog === "edit" || openDialog === "make-public") && (
				<EditTopicModal
					onTopicImageChanged={onTopicImageChanged}
					topic={topic}
					isMakingTopicPublic={openDialog === "make-public"}
					onClose={() => onOpenDialog(null)}
					onTopicSaved={onSaveTopic}
				/>
			)}
			{/* the image dialog that a click on an editor's header image opens */}
			{openDialog === "edit-image" && (
				<EditImageDialog
					editableImage={{ kind: "topic", ...topic }}
					onImageChanged={onTopicImageChanged}
					onClose={() => onOpenDialog(null)}
				/>
			)}
			{/* the image dialog of the topic's latest film, which the action menu's Edit film opens */}
			{openDialog === "edit-film" && editedPodcastEpisode && (
				<TopicPodcastEpisodeVideoImageDialog
					podcastEpisode={editedPodcastEpisode}
					onImageChanged={onTopicImageChanged}
					onClose={() => onOpenDialog(null)}
				/>
			)}
			{openDialog === "share" && (
				<ShareTopic
					topic={topic}
					isDialog
					onClose={() => onOpenDialog(null)}
					onMakeTopicPublic={() => onOpenDialog("make-public")}
				/>
			)}
			{openDialog === "add-topic-to-team" && (
				<AddTopicToTeamDialog
					topic={topic}
					onTopicTeamsChanged={onTopicTeamsChanged}
					onClose={() => onOpenDialog(null)}
				/>
			)}
			{openDialog === "rank" && (
				<RankDialog
					labels={toHomeRankDialogLabels("topics")}
					pageItem={{ id: topic.id, label: topic.name }}
					pinnedItems={(topic.homeTopics ?? []).map((homeTopic) => ({
						id: homeTopic.id,
						label: homeTopic.name,
					}))}
					isPageItemPinned={topic.homeOrder !== null}
					onSave={onRankTopic}
					onClose={() => onOpenDialog(null)}
				/>
			)}
			{openDialog === "rank-profile" && (
				<ProfileRankDialog
					rankedNoun="topics"
					pageItem={{ id: topic.id, label: topic.name }}
					onClose={() => onOpenDialog(null)}
				/>
			)}
			{openDialog === "delete" && (
				<DeleteTopicDialog topic={topic} onClose={() => onOpenDialog(null)} onTopicDeleted={onTopicDeleted} />
			)}
		</>
	)
}

// the podcast episode whose film's image the dialog edits, the call after each new image is in place, and the close
type TopicPodcastEpisodeVideoImageDialogProps = {
	podcastEpisode: PodcastEpisode
	onImageChanged: () => void
	onClose: () => void
}

// the Edit film dialog on the topic page, which opens once the podcast episode's page loads with the editor's view of
// the film's image. a page that does not load reports it and closes
function TopicPodcastEpisodeVideoImageDialog({
	podcastEpisode,
	onImageChanged,
	onClose,
}: TopicPodcastEpisodeVideoImageDialogProps) {
	const editableImage = useTopicPodcastEpisodeVideoEditableImage({
		podcastEpisode,
		onLoadFailed: () => {
			toast.error(REQUEST_FAILED_TEXT)
			onClose()
		},
	})
	if (!editableImage) {
		return null
	}
	return <EditImageDialog editableImage={editableImage} onImageChanged={onImageChanged} onClose={onClose} />
}
