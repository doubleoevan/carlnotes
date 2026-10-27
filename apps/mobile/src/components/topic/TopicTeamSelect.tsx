import type { TopicTeamField } from "@carlnotes/core/hooks/useTopicTeamChoice"
import { NEW_TEAM_OPTION, toTeamChoices } from "@carlnotes/core/lib/topicTeamChoices"
import { View } from "react-native"
import { MultiCombobox } from "@/components/common/MultiCombobox"
import { PreferenceSwitch } from "@/components/common/PreferenceSwitch"
import { TeamInviteFields } from "@/components/invite/TeamInviteFields"
import { Text } from "@/components/primitives/text"
import { SessionTextInput } from "@/components/session/SessionTextInput"

/**
 * Presents the shared Topic team's selection and new-team fields with native controls.
 */
export function TopicTeamSelect({ teamField }: { teamField: TopicTeamField }) {
	return (
		<View className="gap-3">
			<MultiCombobox
				label="Teams"
				options={[...toTeamChoices(teamField.offeredTeams), NEW_TEAM_OPTION]}
				values={teamField.selectedTeamIds}
				onUpdateValues={teamField.setSelectedTeamIds}
				placeholder="Pick teams…"
				emptyLabel={teamField.isLoading ? "Loading…" : "No teams to pick."}
			/>
			{teamField.loadError && <Text className="text-destructive">{teamField.loadError}</Text>}
			{teamField.isNewTeamSelected && (
				<>
					<SessionTextInput
						label="Name"
						placeholder="what to call it…"
						value={teamField.newTeamName}
						onChangeText={teamField.setNewTeamName}
						onBlur={teamField.checkNewTeamName}
					/>
					{teamField.newTeamRejection && <Text className="text-destructive">{teamField.newTeamRejection}</Text>}
					<TeamInviteFields
						teamId={null}
						teamName={teamField.newTeamName}
						pendingInvites={teamField.pendingInvites}
						onPendingInvitesChange={teamField.setPendingInvites}
					/>
					<View className="flex-row items-center gap-2">
						<PreferenceSwitch
							label="Public"
							isChecked={teamField.isNewTeamPublic}
							onChange={teamField.setIsNewTeamPublic}
						/>
						<Text>Public</Text>
					</View>
				</>
			)}
		</View>
	)
}
