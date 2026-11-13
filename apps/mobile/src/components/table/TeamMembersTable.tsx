import type { TeamMember } from "@carlnotes/contracts/teams"
import {
	TeamMembersTable as SharedTeamMembersTable,
	type TeamMembersTableElements,
} from "@carlnotes/core/components/TeamMembersTable"
import { memberSortValues } from "@carlnotes/core/lib/teamMembersTableColumns"
import { X } from "lucide-react-native"
import { useState } from "react"
import { View } from "react-native"
import { ChoiceSelect } from "@/components/common/ChoiceSelect"
import { showConfirmAlert } from "@/components/common/ConfirmDialog"
import { PreferenceSwitch } from "@/components/common/PreferenceSwitch"
import { UserProfileLink } from "@/components/common/UserProfileLink"
import { Button } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"
import { Text } from "@/components/primitives/text"
import { DataTable } from "./DataTable"

/**
 * Renders the web's team members table with native selects, switches, and confirmations.
 */
export function TeamMembersTable({
	teamId,
	members,
	hiddenMemberCount,
	isTeamLeader,
	isReadOnly = false,
	onChanged,
}: {
	teamId: string
	members: TeamMember[]
	hiddenMemberCount: number
	isTeamLeader: boolean
	isReadOnly?: boolean
	onChanged: () => void
}) {
	// a failed change stays under the table until the next one
	const [error, setError] = useState<string | null>(null)
	return (
		<View className="gap-2">
			<SharedTeamMembersTable
				teamId={teamId}
				members={members}
				hiddenMemberCount={hiddenMemberCount}
				isTeamLeader={isTeamLeader}
				isReadOnly={isReadOnly}
				onChanged={onChanged}
				confirm={(copy, onConfirm) => showConfirmAlert({ ...copy, onConfirm })}
				notify={(text, isError) => setError(isError ? text : null)}
				elements={TEAM_MEMBERS_TABLE_ELEMENTS}
			/>
			{error && <Text className="text-sm text-destructive">{error}</Text>}
		</View>
	)
}

// the native cells and the fixed-column table, starting sorted by member
const TEAM_MEMBERS_TABLE_ELEMENTS: TeamMembersTableElements = {
	Text: ({ children }) => <Text className="text-sm text-muted-foreground">{children}</Text>,
	MemberLink: ({ member }) => <UserProfileLink user={member} />,
	Select: ({ label, value, options, isDisabled, onChange }) => (
		<ChoiceSelect
			label={label}
			value={value}
			options={options.map((option) => ({ value: option, label: option }))}
			isDisabled={isDisabled}
			onChange={onChange}
		/>
	),
	ActiveSwitch: ({ action, name, isChecked, isDisabled, onChange }) => (
		<PreferenceSwitch label={`${action} ${name}`} isChecked={isChecked} isDisabled={isDisabled} onChange={onChange} />
	),
	RemoveButton: ({ name, isDisabled, onPress }) => (
		<Button
			size="icon-sm"
			variant="ghost"
			accessibilityLabel={`Remove ${name} from the team`}
			disabled={isDisabled}
			onPress={onPress}
		>
			<Icon as={X} className="size-4" />
		</Button>
	),
	Table: ({ members, columns }) => (
		<DataTable
			rows={members}
			columns={columns}
			valueByKey={memberSortValues}
			initialSort={{ key: "member" }}
			getRowId={(member) => member.userId}
		/>
	),
}
