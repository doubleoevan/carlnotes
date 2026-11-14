import type { TopicTeamField } from "@carlnotes/core/hooks/useTopicTeamChoice"
import { useId } from "react"

export type { TopicTeamField } from "@carlnotes/core/hooks/useTopicTeamChoice"
export { useTopicTeamChoice } from "@carlnotes/core/hooks/useTopicTeamChoice"

import { FieldLabel } from "@/components/common/FieldLabel"
import { MultiCombobox } from "@/components/common/MultiCombobox"
import { TeamInviteFields } from "@/components/invite/TeamInviteFields"
import { Input } from "@/components/primitives/input"
import { Switch } from "@/components/primitives/switch"
import { NEW_TEAM_OPTION, toTeamChoices } from "@/lib/topicTeamChoices"
/**
 * The topic teams multiselect: the leader teams this topic may sit on, and a new team created on save.
 */
export function TopicTeamSelect({ teamField }: { teamField: TopicTeamField }) {
	// the ids that tie each field label to its field
	const teamsComboboxId = useId()
	const newTeamNameInputId = useId()
	return (
		<div className="space-y-3">
			{teamField.loadError && <p className="text-destructive text-sm">{teamField.loadError}</p>}
			<div>
				<FieldLabel htmlFor={teamsComboboxId}>Teams</FieldLabel>
				<MultiCombobox
					id={teamsComboboxId}
					options={toTeamChoices(teamField.offeredTeams)}
					values={teamField.selectedTeamIds}
					onUpdateValues={teamField.setSelectedTeamIds}
					placeholder="Pick teams…"
					emptyLabel="No teams to pick."
					pinnedOption={NEW_TEAM_OPTION}
				/>
			</div>
			{teamField.isNewTeamSelected && (
				<>
					<div>
						<FieldLabel htmlFor={newTeamNameInputId}>Name</FieldLabel>
						<Input
							id={newTeamNameInputId}
							value={teamField.newTeamName}
							placeholder="what to call it…"
							onChange={(event) => teamField.setNewTeamName(event.target.value)}
							onBlur={teamField.checkNewTeamName}
						/>
						{teamField.newTeamRejection && (
							<p className="text-destructive mt-1 text-xs">{teamField.newTeamRejection}</p>
						)}
					</div>
					<TeamInviteFields
						teamId={null}
						teamName={teamField.newTeamName}
						pendingInvites={teamField.pendingInvites}
						onPendingInvitesChange={teamField.setPendingInvites}
					/>
					<div className="flex items-center gap-2 text-sm">
						<Switch
							checked={teamField.isNewTeamPublic}
							onCheckedChange={teamField.setIsNewTeamPublic}
							aria-label="Public"
						/>
						Public
					</div>
				</>
			)}
		</div>
	)
}
