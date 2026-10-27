import type { OwnerTopic } from "@carlnotes/contracts/activity"
import { frequencies, isDailyFrequency } from "@carlnotes/contracts/enums"
import type { ReactNode } from "react"
import type { TableColumn } from "../components/DataTable"
import { toCentsLabel, toCountLabel, toMonthYearLabel } from "./labels"

// the owner table sorts identically on Profile and in the web admin console
export const ownerTopicSortValues = {
	name: (topic: OwnerTopic) => topic.name,
	scans: (topic: OwnerTopic) => topic.monthScanCount,
	subscribers: (topic: OwnerTopic) => topic.subscriberCount,
	created: (topic: OwnerTopic) => topic.createdAt,
	updated: (topic: OwnerTopic) => topic.updatedAt,
	visibility: (topic: OwnerTopic) => topic.visibility,
	schedule: (topic: OwnerTopic) => frequencies.indexOf(topic.frequency),
	emailed: (topic: OwnerTopic) => topic.monthEmailCount,
	cost: (topic: OwnerTopic) => topic.monthCostCents,
	emails: (topic: OwnerTopic) => (topic.isEmailEnabled ? 1 : 0),
}

/**
 * Supplies owner table columns and totals to both apps while each platform renders its controls.
 */
export function toOwnerTopicsTableColumns({
	topics,
	renderText,
	renderName,
	renderSubscribers,
	renderVisibility,
	renderEmail,
	renderCost,
}: {
	topics: OwnerTopic[]
	renderText: (text: string) => ReactNode
	renderName: (topic: OwnerTopic) => ReactNode
	renderSubscribers: (topic: OwnerTopic) => ReactNode
	renderVisibility: (topic: OwnerTopic) => ReactNode
	renderEmail: (topic: OwnerTopic) => ReactNode
	renderCost: (topic: OwnerTopic) => ReactNode
}): TableColumn<OwnerTopic>[] {
	// summarize the complete set, including topics on other pages
	const totalScans = topics.reduce((total, topic) => total + topic.monthScanCount, 0)
	const totalSubscribers = topics.reduce((total, topic) => total + topic.subscriberCount, 0)
	const totalEmails = topics.reduce((total, topic) => total + topic.monthEmailCount, 0)
	const totalCost = topics.reduce((total, topic) => total + topic.monthCostCents, 0)
	return [
		{ key: "name", label: "Topic", width: 192, render: renderName, footer: renderText("Total") },
		{
			key: "scans",
			label: "Brews",
			width: 96,
			tooltip: "Brews this month",
			render: (topic) => renderText(String(topic.monthScanCount)),
			footer: renderText(toCountLabel(totalScans, "brew")),
		},
		{
			key: "subscribers",
			label: "Followers",
			width: 112,
			tooltip: "Active followers, not counting you",
			render: renderSubscribers,
			footer: renderText(toCountLabel(totalSubscribers, "follower")),
		},
		{ key: "created", label: "Created", width: 112, render: (topic) => renderText(toMonthYearLabel(topic.createdAt)) },
		{ key: "updated", label: "Updated", width: 112, render: (topic) => renderText(toMonthYearLabel(topic.updatedAt)) },
		{
			key: "visibility",
			label: "Visibility",
			width: 112,
			tooltip: "Who may see this topic",
			render: renderVisibility,
			footer: renderText(`${topics.filter((topic) => topic.visibility === "public").length}/${topics.length} public`),
		},
		{
			key: "schedule",
			label: "Schedule",
			width: 112,
			tooltip: "How often Carl brews",
			render: (topic) => renderText(topic.frequency.charAt(0).toUpperCase() + topic.frequency.slice(1)),
			footer: renderText(`${topics.filter((topic) => isDailyFrequency(topic.frequency)).length} daily`),
		},
		{
			key: "emails",
			label: "Emails",
			width: 96,
			tooltip: "Receive emails",
			render: renderEmail,
			footer: renderText(`${topics.filter((topic) => topic.isEmailEnabled).length}/${topics.length} on`),
		},
		{
			key: "emailed",
			label: "Emailed",
			width: 112,
			tooltip: "Emails the owner received this month",
			render: (topic) => renderText(String(topic.monthEmailCount)),
			footer: renderText(`${totalEmails} sent`),
		},
		{
			key: "cost",
			label: "Cost",
			width: 112,
			tooltip: "Cost this month",
			render: renderCost,
			footer: renderText(toCentsLabel(totalCost)),
		},
	]
}
