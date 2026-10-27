import type { SubscriptionRow } from "@carlnotes/contracts/activity"
import type { ReactNode } from "react"
import type { TableColumn } from "../components/DataTable"
import { toMonthYearLabel } from "./labels"

// subscription tables start with the newest followed topic and share every other sort
export const subscriptionSortValues = {
	name: (row: SubscriptionRow) => row.name,
	owner: (row: SubscriptionRow) => row.team?.name ?? row.owner.username,
	subscribed: (row: SubscriptionRow) => row.subscribedAt,
	active: (row: SubscriptionRow) => (row.isActive ? 1 : 0),
	emails: (row: SubscriptionRow) => (row.isEmailEnabled ? 1 : 0),
}

/**
 * Builds Activity's shared subscription columns and totals.
 */
export function toTopicSubscriptionsTableColumns({
	subscriptions,
	renderText,
	renderName,
	renderOwner,
	renderActive,
	renderEmails,
	renderRemove,
}: {
	subscriptions: SubscriptionRow[]
	renderText: (text: string) => ReactNode
	renderName: (row: SubscriptionRow) => ReactNode
	renderOwner: (row: SubscriptionRow) => ReactNode
	renderActive: (row: SubscriptionRow) => ReactNode
	renderEmails: (row: SubscriptionRow) => ReactNode
	renderRemove: (row: SubscriptionRow) => ReactNode
}): TableColumn<SubscriptionRow>[] {
	// count confirmed preferences across the complete set
	const activeCount = subscriptions.filter((row) => row.isActive).length
	const emailCount = subscriptions.filter((row) => row.isEmailEnabled).length
	return [
		{ key: "name", label: "Topic", width: 192, render: renderName, footer: renderText("Total") },
		{ key: "owner", label: "Owner", width: 176, render: renderOwner },
		{
			key: "subscribed",
			label: "Followed",
			width: 112,
			render: (row) => renderText(toMonthYearLabel(row.subscribedAt)),
		},
		{
			key: "active",
			label: "Active",
			width: 112,
			render: renderActive,
			footer: renderText(`${activeCount}/${subscriptions.length} active`),
		},
		{
			key: "emails",
			label: "Emails",
			width: 112,
			tooltip: "Receive emails",
			render: renderEmails,
			footer: renderText(`${emailCount}/${subscriptions.length} on`),
		},
		{ key: "remove", label: "", width: 56, isSortable: false, render: renderRemove },
	]
}
