// the team page's dialogs: editing the team, starting a topic on it, and inviting members
import type { TeamPageResponse } from "@shared/contracts/teams"
import { InviteMembersModal } from "@/components/invite/InviteMembersModal"
import { EditTeamModal } from "@/components/team/EditTeamModal"
import { NewTopicDialog } from "@/components/topic/TopicEditorChoiceDialog"

// which of the team page's dialogs is open
export type TeamDialog = "edit" | "new-topic" | "invite"

/**
 * The team page's dialogs, each mounted only while open, so its state resets every time.
 */
export function TeamDialogs({
	teamPage,
	addableTopics,
	openDialog,
	onOpenDialog,
	onChanged,
	onNewTopicSaved,
}: {
	teamPage: TeamPageResponse
	addableTopics: { id: string; name: string }[]
	openDialog: TeamDialog | null
	onOpenDialog: (dialog: TeamDialog | null) => void
	onChanged: () => void
	// a new topic opens on its own page, where its sources are set up
	onNewTopicSaved: (topicId: string) => void
}) {
	return (
		<>
			{/* the shared team modal, in its edit shape */}
			{openDialog === "edit" && (
				<EditTeamModal
					team={{
						teamId: teamPage.teamId,
						name: teamPage.name,
						description: teamPage.description,
						avatarVersion: teamPage.avatarVersion,
						isPublic: teamPage.isPublic,
					}}
					currentTopics={teamPage.topics.map((teamTopic) => ({ id: teamTopic.id, name: teamTopic.name }))}
					userTopics={addableTopics}
					onClose={() => onOpenDialog(null)}
					onSaveTeam={onChanged}
				/>
			)}
			{/* a new topic starts on this team, in the form or with carl, and opens on its own page */}
			{openDialog === "new-topic" && (
				<NewTopicDialog
					initialTeam={{ teamId: teamPage.teamId, name: teamPage.name }}
					onClose={() => onOpenDialog(null)}
					onTopicSaved={async (topicId) => onNewTopicSaved(topicId)}
				/>
			)}
			{/* a member's invite dialog, the team form's invite fields on their own */}
			{openDialog === "invite" && (
				<InviteMembersModal teamId={teamPage.teamId} teamName={teamPage.name} onClose={() => onOpenDialog(null)} />
			)}
		</>
	)
}
