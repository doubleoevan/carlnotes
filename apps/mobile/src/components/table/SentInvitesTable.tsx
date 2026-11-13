import {
	type SentInvitesTableElements,
	SentInvitesTable as SharedSentInvitesTable,
} from "@carlnotes/core/components/SentInvitesTable"
import type { SentInviteRow, SentInvitesTableLabels } from "@carlnotes/core/lib/sentInvitesTableColumns"
import { View } from "react-native"
import { PreferenceSwitch } from "@/components/common/PreferenceSwitch"
import { UserProfileLink } from "@/components/common/UserProfileLink"
import { Text } from "@/components/primitives/text"
import { usePageMutation } from "@/hooks/usePageMutation"
import { DataTable } from "./DataTable"
import { TableConfirmAlert } from "./TableConfirmAlert"

/**
 * Renders the web's sent invites table through native controls and the system alert.
 */
export function SentInvitesTable({
	inviteRows,
	labels,
	onDeleteInvite,
	onReload,
}: {
	inviteRows: SentInviteRow[]
	labels: SentInvitesTableLabels
	onDeleteInvite: (row: SentInviteRow) => Promise<void>
	onReload: () => void
}) {
	// one change at a time, with a failed one kept on screen
	const mutation = usePageMutation(onReload)
	return (
		<View className="gap-2">
			<SharedSentInvitesTable
				inviteRows={inviteRows}
				labels={labels}
				isDisabled={mutation.isPending}
				onDeleteInvite={(row) => mutation.run(() => onDeleteInvite(row))}
				elements={SENT_INVITES_TABLE_ELEMENTS}
			/>
			{mutation.error && <Text className="text-destructive">{mutation.error}</Text>}
		</View>
	)
}

// the native table with its sorting and pagination, the profile link, and the switch
export const SENT_INVITES_TABLE_ELEMENTS: SentInvitesTableElements = {
	Table: DataTable,
	Text: ({ children }) => <Text className="text-sm text-muted-foreground">{children}</Text>,
	Invitee: ({ row }) =>
		row.invitee ? (
			<UserProfileLink user={row.invitee} displayName={row.inviteeEmail ?? row.invitee.username} />
		) : (
			<Text className="text-sm">{row.inviteeEmail}</Text>
		),
	WithdrawSwitch: ({ invitee, isDisabled, onWithdraw }) => (
		<PreferenceSwitch
			label={`Withdraw the invite to ${invitee}`}
			isChecked
			isDisabled={isDisabled}
			onChange={onWithdraw}
		/>
	),
	Confirmation: TableConfirmAlert,
}
