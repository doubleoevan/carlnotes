import {
	type SentInviteRow,
	type SentInvitesTableLabels,
	sentInviteSortValues,
	toInviteeLabel,
	toSentInvitesTableColumns,
} from "@carlnotes/core/lib/sentInvitesTableColumns"
import { Alert, View } from "react-native"
import { PreferenceSwitch } from "@/components/common/PreferenceSwitch"
import { UserProfileLink } from "@/components/common/UserProfileLink"
import { Text } from "@/components/primitives/text"
import { usePageMutation } from "@/hooks/usePageMutation"
import { DataTable } from "./DataTable"

/**
 * Adapts the shared sent-invitation table to native controls and confirmation.
 */
export function SentInvitesTable({
	inviteRows,
	targetLabel,
	acceptedLabel,
	acceptedNoun,
	confirmTitle,
	confirmLabel,
	confirmBody,
	onDeleteInvite,
	onReload,
}: SentInvitesTableLabels<string> & {
	inviteRows: SentInviteRow[]
	onDeleteInvite: (row: SentInviteRow) => Promise<void>
	onReload: () => void
}) {
	const mutation = usePageMutation(onReload)
	function handleDelete(row: SentInviteRow): void {
		Alert.alert(confirmTitle, confirmBody(row), [
			{ text: "Keep it", style: "cancel" },
			{ text: confirmLabel, style: "destructive", onPress: () => void mutation.run(() => onDeleteInvite(row)) },
		])
	}
	const columns = toSentInvitesTableColumns({
		inviteRows,
		targetLabel,
		acceptedLabel,
		acceptedNoun,
		renderText: (text) => <Text className="text-sm text-muted-foreground">{text}</Text>,
		renderInvitee: (row) =>
			row.invitee ? (
				<UserProfileLink user={row.invitee} displayName={row.inviteeEmail ?? row.invitee.username} />
			) : (
				<Text className="text-sm">{row.inviteeEmail}</Text>
			),
		renderActive: (row) => (
			<PreferenceSwitch
				label={`Withdraw the invitation to ${toInviteeLabel(row)}`}
				isChecked
				isDisabled={mutation.isPending}
				onChange={() => handleDelete(row)}
			/>
		),
	})
	return (
		<View className="gap-2">
			<DataTable
				rows={inviteRows}
				columns={columns}
				valueByKey={sentInviteSortValues}
				initialSort={{ key: "invited", isDescending: true }}
				getRowId={(row) => row.inviteId}
			/>
			{mutation.error && <Text className="text-destructive">{mutation.error}</Text>}
		</View>
	)
}
