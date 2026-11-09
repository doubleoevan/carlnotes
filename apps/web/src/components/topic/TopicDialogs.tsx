import type { TopicResponse } from "@carlnotes/contracts/topics"
import { type HomeOrderMove, HomeRankDialog } from "@/components/common/HomeRankDialog"
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
	| "edit-image"
	| "make-public"
	| "share"
	| "add-topic-to-team"
	| "rank"
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
	onRankTopic: (moves: HomeOrderMove[]) => Promise<void>
	onTopicDeleted: () => Promise<void>
}) {
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
					subject={{ kind: "topic", ...topic }}
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
				<HomeRankDialog
					noun="topics"
					pageItem={{ id: topic.id, label: topic.name }}
					homeItems={(topic.homeTopics ?? []).map((homeTopic) => ({
						id: homeTopic.id,
						label: homeTopic.name,
					}))}
					isPageItemOnHome={topic.homeOrder !== null}
					onSave={onRankTopic}
					onClose={() => onOpenDialog(null)}
				/>
			)}
			{openDialog === "delete" && (
				<DeleteTopicDialog topic={topic} onClose={() => onOpenDialog(null)} onTopicDeleted={onTopicDeleted} />
			)}
		</>
	)
}
