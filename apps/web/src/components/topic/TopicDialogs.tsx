import type { PodcastEpisode } from "@carlnotes/contracts/podcast"
import type { TopicResponse } from "@carlnotes/contracts/topics"
import { usePodcastEpisodeEditorPage } from "@carlnotes/core/hooks/useEditorPage"
import { toTopicPageEditablePodcastEpisodes, toTopicVideoEditableImage } from "@carlnotes/core/lib/podcastEpisodeEditor"
import { type FeaturedOrderMove, toHomeRankDialogLabels } from "@carlnotes/core/lib/rankDialog"
import { REQUEST_FAILED_TEXT } from "@carlnotes/core/lib/sessionCopy"
import { toast } from "sonner"
import { ProfileRankDialog, RankDialog } from "@/components/common/RankDialog"
import { EditPodcastEpisodeDialog } from "@/components/podcast/EditPodcastEpisodeDialog"
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
	| "edit-podcast"
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
	onPodcastEpisodeChanged,
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
	// called after a podcast episode's save or a new film image
	onPodcastEpisodeChanged: () => void
	onRankTopic: (moves: FeaturedOrderMove[]) => Promise<void>
	onTopicDeleted: () => Promise<void>
}) {
	// the podcast episodes that Edit film and Edit podcast edit, for a user who may edit them
	const { topicVideoPodcastEpisode, latestPodcastEpisode } = toTopicPageEditablePodcastEpisodes(topic)
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
			{/* the image dialog of the topic's latest film, which the action menu's Edit film opens, and the Edit podcast
			    dialog of the topic's latest podcast episode */}
			{openDialog === "edit-film" && topicVideoPodcastEpisode && (
				<PodcastEpisodeEditorDialog
					openDialog={openDialog}
					podcastEpisode={topicVideoPodcastEpisode}
					onPodcastEpisodeChanged={onPodcastEpisodeChanged}
					onClose={() => onOpenDialog(null)}
				/>
			)}
			{openDialog === "edit-podcast" && latestPodcastEpisode && (
				<PodcastEpisodeEditorDialog
					openDialog={openDialog}
					podcastEpisode={latestPodcastEpisode}
					onPodcastEpisodeChanged={onPodcastEpisodeChanged}
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
					featuredItems={(topic.homeTopics ?? []).map((homeTopic) => ({
						id: homeTopic.id,
						label: homeTopic.name,
					}))}
					isPageItemFeatured={topic.homeOrder !== null}
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

// the option's dialog, the podcast episode it edits, the call after a save or a new film image, and the close
type PodcastEpisodeEditorDialogProps = {
	openDialog: Extract<TopicDialog, "edit-film" | "edit-podcast">
	podcastEpisode: PodcastEpisode
	onPodcastEpisodeChanged: () => void
	onClose: () => void
}

// the Edit film or Edit podcast dialog on the topic page, which opens once the podcast episode's page loads with the
// editor's view of the podcast episode and its film. a page that does not load reports it and closes
function PodcastEpisodeEditorDialog({
	openDialog,
	podcastEpisode,
	onPodcastEpisodeChanged,
	onClose,
}: PodcastEpisodeEditorDialogProps) {
	const podcastEpisodePage = usePodcastEpisodeEditorPage({
		podcastEpisode,
		onLoadFailed: () => {
			toast.error(REQUEST_FAILED_TEXT)
			onClose()
		},
	})
	if (!podcastEpisodePage) {
		return null
	}
	return openDialog === "edit-film" ? (
		<EditImageDialog
			editableImage={toTopicVideoEditableImage(podcastEpisodePage)}
			onImageChanged={onPodcastEpisodeChanged}
			onClose={onClose}
		/>
	) : (
		<EditPodcastEpisodeDialog
			podcastEpisodePage={podcastEpisodePage}
			onPodcastEpisodeChanged={onPodcastEpisodeChanged}
			onClose={onClose}
		/>
	)
}
