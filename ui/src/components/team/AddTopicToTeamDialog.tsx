import { Dialog, DialogContent, DialogTitle } from "@/components/primitives/dialog"
import {
	AddTopicToTeamOptionList,
	type AddTopicToTeamTopic,
	useAddTopicToTeam,
} from "@/components/team/AddTopicToTeamButton"

/**
 * The Add topic to team dialog, with the add topic to team options for the topic.
 */
export function AddTopicToTeamDialog({
	topic,
	onTopicTeamsChanged,
	onClose,
}: {
	topic: AddTopicToTeamTopic
	onTopicTeamsChanged: () => void
	onClose: () => void
}) {
	const addTopicToTeamState = useAddTopicToTeam({ topic, shouldLoadLeaderTeams: true, onTopicTeamsChanged })

	// show the New team modal in place of the dialog while the modal is open
	if (addTopicToTeamState.newTeamModal) {
		return addTopicToTeamState.newTeamModal
	}
	return (
		<Dialog open onOpenChange={(isOpen) => !isOpen && onClose()}>
			{/* the title and the add topic to team options */}
			<DialogContent className="gap-2 p-4 sm:max-w-xs">
				<DialogTitle>Add topic to team</DialogTitle>
				{/* one list once the user's teams load. the wrapper keeps the grid gap from falling between the options */}
				{addTopicToTeamState.leaderTeams && (
					<div className="grid">
						<AddTopicToTeamOptionList addTopicToTeamState={addTopicToTeamState} />
					</div>
				)}
			</DialogContent>
		</Dialog>
	)
}
