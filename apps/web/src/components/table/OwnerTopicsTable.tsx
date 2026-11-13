import { sendSubscriptionEmail } from "@carlnotes/client/topicClient"
import type { OwnerTopic } from "@carlnotes/contracts/activity"
import type { DataTableElements } from "@carlnotes/core/components/DataTable"
import {
	type OwnerTopicsTableElements,
	OwnerTopicsTable as SharedOwnerTopicsTable,
} from "@carlnotes/core/components/OwnerTopicsTable"
import { toCentsLabel } from "@carlnotes/core/lib/labels"
import { ownerTopicSortValues } from "@carlnotes/core/lib/ownerTopicsTableColumns"
import { cn } from "@carlnotes/nightshift/classNames"
import { ChevronDown, Globe, Lock, Mail } from "lucide-react"
import { CoffeeLoading } from "@/components/branding/CoffeeLoading"
import { Switch } from "@/components/primitives/switch"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import { STANDALONE_LINK_CLASS } from "@/lib/styleClasses"
import { SUBTABLE_CARD_CLASS, TABLE_CLASS, TABLE_SCROLL_CLASS } from "@/lib/tableClasses"
import { DATA_TABLE_ELEMENTS, DataTable } from "./DataTable"
import { SubtableCountButton } from "./SubtableCountButton"
import { EmptyListCard } from "./TableCard"
import { TopicNameLink } from "./TopicNameLink"
import { TopicScansTable } from "./TopicScansTable"
import { TopicSubscribersTable } from "./TopicSubscribersTable"

// the icon and label each visibility reads as, matching the topic page's own info card
const VISIBILITY_METADATA = {
	private: { icon: Lock, label: "private" },
	public: { icon: Globe, label: "public" },
	invite: { icon: Mail, label: "invite" },
}

/**
 * Renders the shared owner topic table with web scan and subscriber subtables.
 */
export function OwnerTopicsTable({
	topics,
	onReloadPage,
	canListSubscribers = false,
	className,
}: {
	topics: OwnerTopic[]
	onReloadPage: () => void
	canListSubscribers?: boolean
	className?: string
}) {
	// an email change saves, then the page reloads
	async function handleEmailChange(topic: OwnerTopic, isEmailEnabled: boolean): Promise<void> {
		await sendSubscriptionEmail(topic.id, isEmailEnabled, topic.ownerUserId)
		onReloadPage()
	}
	return (
		<SharedOwnerTopicsTable
			topics={topics}
			canListSubscribers={canListSubscribers}
			className={className}
			onEmailChange={(topic, isEnabled) => void handleEmailChange(topic, isEnabled)}
			elements={OWNER_TOPICS_TABLE_ELEMENTS}
		/>
	)
}

// preserve the admin subtable's independent sizing
const OWNER_TABLE_ELEMENTS: DataTableElements = {
	...DATA_TABLE_ELEMENTS,
	Table: ({ children }) => (
		<div className={cn(TABLE_SCROLL_CLASS, "contain-inline-size")}>
			<table className={cn(TABLE_CLASS, "min-w-2xl! table-auto!")}>{children}</table>
		</div>
	),
}

// the web cells: links, the email switch, and the count and cost buttons that open a subtable under the row
const OWNER_TOPICS_TABLE_ELEMENTS: OwnerTopicsTableElements = {
	Text: ({ children }) => <span>{children}</span>,
	Name: ({ topic }) => <TopicNameLink topic={topic} />,
	Visibility: ({ visibility }) => <TopicVisibility visibility={visibility} />,
	EmailSwitch: ({ topic, isDisabled, onChange }) => (
		<Switch
			checked={topic.isEmailEnabled}
			disabled={isDisabled}
			onCheckedChange={onChange}
			aria-label={`${topic.name} emails`}
		/>
	),
	SubscribersToggle: ({ topic, isOpen, onToggle }) => (
		<SubtableCountButton
			count={topic.subscriberCount}
			isOpen={isOpen}
			ariaLabel={`Show ${topic.name}'s followers`}
			onClick={onToggle}
		/>
	),
	CostToggle: ({ topic, isOpen, onToggle }) => (
		<Tooltip>
			<TooltipTrigger asChild>
				<button
					type="button"
					onClick={onToggle}
					className={cn(STANDALONE_LINK_CLASS, "inline-flex items-center gap-0.5")}
					aria-expanded={isOpen}
				>
					{toCentsLabel(topic.monthCostCents)}
					<ChevronDown
						aria-hidden="true"
						className={cn("size-3.5 shrink-0 transition-transform", isOpen && "rotate-180")}
					/>
				</button>
			</TooltipTrigger>
			<TooltipContent>Brew costs</TooltipContent>
		</Tooltip>
	),
	Detail: ({ topic, detail }) =>
		detail === "scans" ? (
			<TopicScansTable scans={topic.scans} topic={topic} />
		) : (
			<TopicSubscribersTable topicId={topic.id} />
		),
	// the card with the sorted, paged rows and each row's open subtable under it
	Table: ({ className, topics, columns, renderDetail }) => (
		<DataTable
			rows={topics}
			columns={columns}
			valueByKey={ownerTopicSortValues}
			getRowId={(topic) => topic.id}
			className={cn("mb-4", className)}
			elements={OWNER_TABLE_ELEMENTS}
			renderDetails={renderDetail}
		/>
	),
	EmptyCard: ({ text, className }) => <EmptyListCard className={className}>{text}</EmptyListCard>,
}

// the topic's visibility with its icon
export function TopicVisibility({ visibility }: { visibility: OwnerTopic["visibility"] }) {
	const visibilityMetadata = VISIBILITY_METADATA[visibility]
	return (
		<span className="flex items-center gap-1.5">
			<visibilityMetadata.icon aria-hidden="true" className="size-3.5 shrink-0" />
			{visibilityMetadata.label}
		</span>
	)
}

/**
 * The row an admin table opens under a user or team: their topics once loaded, and the loading cup
 * until then.
 */
export function TopicsSubtableRow({
	topics,
	colSpan,
	onReloadPage,
}: {
	topics: OwnerTopic[] | null
	colSpan: number
	onReloadPage: () => void
}) {
	return (
		<tr className="border-b">
			<td colSpan={colSpan} className="py-2">
				{topics ? (
					<OwnerTopicsTable
						topics={topics}
						onReloadPage={onReloadPage}
						canListSubscribers
						className={SUBTABLE_CARD_CLASS}
					/>
				) : (
					<CoffeeLoading className="min-h-0 justify-start py-2 text-sm" />
				)}
			</td>
		</tr>
	)
}
