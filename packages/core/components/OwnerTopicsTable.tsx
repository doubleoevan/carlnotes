import type { OwnerTopic } from "@carlnotes/contracts/activity"
import { type ComponentType, type ReactNode, useState } from "react"
import { toOwnerTopicsTableColumns } from "../lib/ownerTopicsTableColumns"
import type { TableColumn } from "./DataTable"

// the detail a topic row opens: its scans this month, or, in the admin console, its followers
export type OwnerTopicDetail = "scans" | "subscribers"
type DetailToggleProps = { topic: OwnerTopic; isOpen: boolean; onToggle: () => void }
export type OwnerTopicsTableElements = {
	Text: ComponentType<{ children: ReactNode }>
	Name: ComponentType<{ topic: OwnerTopic }>
	Visibility: ComponentType<{ visibility: OwnerTopic["visibility"] }>
	EmailSwitch: ComponentType<{ topic: OwnerTopic; isDisabled: boolean; onChange: (isEnabled: boolean) => void }>
	// the follower count that opens the topic's followers, and the month's cost that opens its scans
	SubscribersToggle: ComponentType<DetailToggleProps>
	CostToggle: ComponentType<DetailToggleProps>
	// an open detail: under the row on the web, in a sheet on a phone
	Detail: ComponentType<{ topic: OwnerTopic; detail: OwnerTopicDetail; onClose: () => void }>
	// the sorted, paged table, which renders each row's open detail
	Table: ComponentType<{
		className?: string
		topics: OwnerTopic[]
		columns: TableColumn<OwnerTopic>[]
		renderDetail: (topic: OwnerTopic) => ReactNode
	}>
	EmptyCard: ComponentType<{ text: string; className?: string }>
}

/**
 * Renders the topics an owner keeps with their month's scans, followers, schedule, emails, and cost, and the detail a
 * row opens, through platform table elements.
 */
export function OwnerTopicsTable({
	topics,
	canListSubscribers = false,
	isPending = false,
	className,
	onEmailChange,
	elements: { Text, Name, Visibility, EmailSwitch, SubscribersToggle, CostToggle, Detail, Table, EmptyCard },
}: {
	topics: OwnerTopic[]
	// the admin console lists each topic's followers
	canListSubscribers?: boolean
	// true while an email change saves
	isPending?: boolean
	// the table card's own classes, such as the admin console's subtable card
	className?: string
	onEmailChange: (topic: OwnerTopic, isEnabled: boolean) => void
	elements: OwnerTopicsTableElements
}) {
	// each topic's open detail, kept through sorting and paging
	const [openDetailByTopicId, setOpenDetailByTopicId] = useState<Record<string, OwnerTopicDetail | undefined>>({})
	function toggleDetail(topicId: string, detail: OwnerTopicDetail): void {
		setOpenDetailByTopicId((previous) => ({
			...previous,
			[topicId]: previous[topicId] === detail ? undefined : detail,
		}))
	}
	function closeDetail(topicId: string): void {
		setOpenDetailByTopicId((previous) => ({ ...previous, [topicId]: undefined }))
	}

	// the shared columns with this platform's cells
	const columns = toOwnerTopicsTableColumns({
		topics,
		renderText: (text) => <Text>{text}</Text>,
		renderName: (topic) => <Name topic={topic} />,
		renderSubscribers: (topic) =>
			canListSubscribers ? (
				<SubscribersToggle
					topic={topic}
					isOpen={openDetailByTopicId[topic.id] === "subscribers"}
					onToggle={() => toggleDetail(topic.id, "subscribers")}
				/>
			) : (
				<Text>{String(topic.subscriberCount)}</Text>
			),
		renderVisibility: (topic) => <Visibility visibility={topic.visibility} />,
		renderEmail: (topic) => (
			<EmailSwitch topic={topic} isDisabled={isPending} onChange={(isEnabled) => onEmailChange(topic, isEnabled)} />
		),
		renderCost: (topic) => (
			<CostToggle
				topic={topic}
				isOpen={openDetailByTopicId[topic.id] === "scans"}
				onToggle={() => toggleDetail(topic.id, "scans")}
			/>
		),
	})
	if (!topics.length) {
		return <EmptyCard text="No topics yet." className={className} />
	}
	return (
		<Table
			className={className}
			topics={topics}
			columns={columns}
			renderDetail={(topic) => {
				const detail = openDetailByTopicId[topic.id]
				return detail ? <Detail topic={topic} detail={detail} onClose={() => closeDetail(topic.id)} /> : null
			}}
		/>
	)
}
