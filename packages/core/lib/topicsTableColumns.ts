import type { Topic } from "@carlnotes/contracts/profiles"
import type { ReactNode } from "react"
import type { TableColumn } from "../components/DataTable"
import { toCountLabel, toMonthYearLabel } from "./labels"

export const topicSortValues = {
	topic: (topic: Topic) => topic.name,
	created: (topic: Topic) => topic.createdAt,
	updated: (topic: Topic) => topic.updatedAt,
	kept: (topic: Topic) => (topic.seenCount > 0 ? topic.keptCount / topic.seenCount : 0),
	subscribers: (topic: Topic) => topic.subscriberCount,
	visibility: (topic: Topic) => topic.visibility,
	emails: (topic: Topic) => (topic.isEmailEnabled ? 1 : 0),
}

/**
 * Builds the web and mobile topic table's columns, conditional controls, and complete-data totals.
 */
export function toTopicsTableColumns({
	topics,
	includesNonPublicTopics,
	topicTooltip,
	renderText,
	renderName,
	renderVisibility,
	renderInfo,
	renderEmail,
	renderActive,
	renderRemove,
}: {
	topics: Topic[]
	includesNonPublicTopics: boolean
	topicTooltip?: string
	renderText: (text: string) => ReactNode
	renderName: (topic: Topic) => ReactNode
	renderVisibility: (topic: Topic) => ReactNode
	renderInfo: (topic: Topic) => ReactNode
	renderEmail: (topic: Topic) => ReactNode
	renderActive?: (topic: Topic) => ReactNode
	renderRemove?: (topic: Topic) => ReactNode
}): TableColumn<Topic>[] {
	// total every topic, not just the displayed page
	const kept = topics.reduce((sum, topic) => sum + topic.keptCount, 0)
	const seen = topics.reduce((sum, topic) => sum + topic.seenCount, 0)
	const subscribers = topics.reduce((sum, topic) => sum + topic.subscriberCount, 0)
	const publicCount = topics.filter((topic) => topic.visibility === "public").length
	const columns: TableColumn<Topic>[] = [
		{
			key: "topic",
			label: "Topic",
			width: 192,
			tooltip: topicTooltip,
			render: renderName,
			footer: renderText("Total"),
		},
		{ key: "created", label: "Created", width: 112, render: (topic) => renderText(toMonthYearLabel(topic.createdAt)) },
		{ key: "updated", label: "Updated", width: 112, render: (topic) => renderText(toMonthYearLabel(topic.updatedAt)) },
	]
	if (includesNonPublicTopics) {
		columns.push({
			key: "visibility",
			label: "Visibility",
			width: 112,
			tooltip: "Who may see this topic",
			render: renderVisibility,
			footer: renderText(`${publicCount}/${topics.length} public`),
		})
	}
	columns.push(
		{
			key: "subscribers",
			label: "Followers",
			width: 112,
			tooltip: "Topic followers",
			render: (topic) => renderText(topic.subscriberCount.toLocaleString()),
			footer: renderText(toCountLabel(subscribers, "follower")),
		},
		{
			key: "kept",
			label: "Kept / reviewed",
			width: 160,
			tooltip: "Carl reviewed and kept these findings",
			render: renderInfo,
			footer: renderText(`${kept.toLocaleString()} / ${seen.toLocaleString()} findings`),
		},
	)
	if (topics.some((topic) => topic.isEmailEnabled !== null)) {
		columns.push({
			key: "emails",
			label: "Emails",
			width: 96,
			tooltip: "Email me this topic's scans",
			render: (topic) => (topic.isEmailEnabled === null ? null : renderEmail(topic)),
		})
	}
	if (renderActive) {
		columns.push({
			key: "active",
			label: "Active",
			width: 96,
			isSortable: false,
			render: renderActive,
			footer: renderText(`${topics.length}/${topics.length} active`),
		})
	}
	if (renderRemove) {
		columns.push({ key: "remove", label: "", width: 64, isSortable: false, render: renderRemove })
	}
	return columns
}
