import type { SubscriptionRow } from "@carlnotes/contracts/activity"
import type { ProfileIdentity } from "@carlnotes/contracts/profiles"
import { toTopicPath } from "@carlnotes/contracts/seo"
import type { TeamIdentity } from "@carlnotes/contracts/teamIdentity"
import { type ComponentType, useState } from "react"
import type { ConfirmationProps, SortedTableElement } from "../lib/tableElements"
import { subscriptionSortValues, toTopicSubscriptionsTableColumns } from "../lib/topicSubscriptionsTableColumns"

export type TopicSubscriptionsTableElements = {
	Table: SortedTableElement
	Text: ComponentType<{ children: string }>
	// the topic's name linked to its page, with the Invited line under a pending invite's
	TopicName: ComponentType<{ row: SubscriptionRow; invitedLabel: string | null }>
	TeamLink: ComponentType<{ team: TeamIdentity }>
	UserProfileLink: ComponentType<{ user: ProfileIdentity }>
	Switch: ComponentType<{
		label: string
		isChecked: boolean
		isDisabled: boolean
		onChange: (isChecked: boolean) => void
	}>
	// the delete button, labeled with what it deletes and the topic it names
	RemoveButton: ComponentType<{ action: string; topicName: string; isDisabled: boolean; onPress: () => void }>
	Confirmation: ComponentType<ConfirmationProps>
}

/**
 * Lists the topics a user follows and the topic invites waiting for their answer: the owner, when each was followed,
 * the Active and Emails switches, and the delete button with its confirmation.
 */
export function TopicSubscriptionsTable({
	subscriptions,
	isReadOnly = false,
	isDisabled = false,
	onActiveChange,
	onEmailChange,
	onDelete,
	isRemovable = () => true,
	elements: { Table, Text, TopicName, TeamLink, UserProfileLink, Switch, RemoveButton, Confirmation },
}: {
	subscriptions: SubscriptionRow[]
	// an admin reading another user's page sees disabled switches and no delete button
	isReadOnly?: boolean
	// true while a change is on its way
	isDisabled?: boolean
	onActiveChange: (row: SubscriptionRow, isActive: boolean) => void
	// flips a row's emails, or undefined for a table without the Emails column
	onEmailChange?: (row: SubscriptionRow, isEnabled: boolean) => void
	// deletes a subscription, or declines a pending invite
	onDelete: (row: SubscriptionRow) => Promise<void>
	// whether a row shows its delete button, every row's by default
	isRemovable?: (row: SubscriptionRow) => boolean
	elements: TopicSubscriptionsTableElements
}) {
	// the row waiting for its delete confirmation, or null
	const [rowToDelete, setRowToDelete] = useState<SubscriptionRow | null>(null)

	// the shared column composition and totals
	const columns = toTopicSubscriptionsTableColumns({
		subscriptions,
		renderText: (text) => <Text>{text}</Text>,
		renderName: (row) => <TopicName row={row} invitedLabel={row.inviteId ? "Invited" : null} />,
		renderOwner: (row) => (row.team ? <TeamLink team={row.team} /> : <UserProfileLink user={row.owner} />),
		renderActive: (row) => (
			<Switch
				label={row.inviteId ? `Accept the invite to ${row.name}` : `Follow ${row.name}`}
				isChecked={row.isActive}
				isDisabled={isReadOnly || isDisabled}
				onChange={(isActive) => onActiveChange(row, isActive)}
			/>
		),
		renderEmails:
			onEmailChange &&
			((row) => (
				<Switch
					label={`${row.name} emails`}
					isChecked={row.isEmailEnabled}
					isDisabled={isReadOnly || isDisabled || Boolean(row.inviteId)}
					onChange={(isEnabled) => onEmailChange(row, isEnabled)}
				/>
			)),
		renderRemove: (row) =>
			!isReadOnly &&
			isRemovable(row) && (
				<RemoveButton
					action={row.inviteId ? "Delete the invite to" : "Unfollow"}
					topicName={row.name}
					isDisabled={isDisabled}
					onPress={() => setRowToDelete(row)}
				/>
			),
	})
	return (
		<>
			{/* newest followed first */}
			<Table
				rows={subscriptions}
				columns={columns}
				valueByKey={subscriptionSortValues}
				initialSort={{ key: "subscribed", isDescending: true }}
				getRowId={(row) => row.topicId}
			/>
			{/* the delete confirmation, mounted only while a row waits for it */}
			{rowToDelete && (
				<Confirmation
					{...toSubscriptionDeleteConfirmation(rowToDelete)}
					onConfirm={async () => {
						await onDelete(rowToDelete)
						setRowToDelete(null)
					}}
					onClose={() => setRowToDelete(null)}
				/>
			)}
		</>
	)
}

// what unfollowing a topic or deleting a pending invite says before it goes
function toSubscriptionDeleteConfirmation(row: SubscriptionRow): Omit<ConfirmationProps, "onConfirm" | "onClose"> {
	const isInvite = row.inviteId !== null
	return {
		title: isInvite ? "Delete this invite?" : "Unfollow this topic?",
		confirmLabel: isInvite ? "Delete invite" : "Unfollow",
		cancelLabel: "Keep it",
		body: {
			beforeTarget: isInvite ? "Your invite to " : "You stop following ",
			target: row.name,
			afterTarget: isInvite ? " goes away, and whoever sent it is not told." : ".",
			targetHref: toTopicPath({ id: row.topicId, name: row.name }),
		},
	}
}
