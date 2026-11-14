import { sendSubscriptionEmail } from "@carlnotes/client/topicClient"
import type { OwnerTopic } from "@carlnotes/contracts/activity"
import {
	type OwnerTopicsTableElements,
	OwnerTopicsTable as SharedOwnerTopicsTable,
} from "@carlnotes/core/components/OwnerTopicsTable"
import { toCentsLabel } from "@carlnotes/core/lib/labels"
import { ownerTopicSortValues } from "@carlnotes/core/lib/ownerTopicsTableColumns"
import { ChevronDown } from "lucide-react-native"
import { Fragment } from "react"
import { View } from "react-native"
import { PreferenceSwitch } from "@/components/common/PreferenceSwitch"
import { Sheet } from "@/components/common/Sheet"
import { Button } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"
import { Text } from "@/components/primitives/text"
import { TopicVisibility } from "@/components/topic/TopicInfo"
import { usePageMutation } from "@/hooks/usePageMutation"
import { DataTable } from "./DataTable"
import { EmptyListCard } from "./TableCard"
import { TopicNameLink } from "./TopicNameLink"
import { TopicScansTable } from "./TopicScansTable"

/**
 * Renders the web's owner topic table, with a topic's scans in a native sheet.
 */
export function OwnerTopicsTable({
	topics,
	profileUserId,
	onReloadPage,
}: {
	topics: OwnerTopic[]
	// on a profile, the person whose rows show the owner's controls
	profileUserId?: string
	onReloadPage: () => void
}) {
	// an email change saves, then the page reloads, and a failed one stays under the table
	const mutation = usePageMutation(onReloadPage)
	return (
		<View className="gap-2">
			<SharedOwnerTopicsTable
				topics={topics}
				profileUserId={profileUserId}
				isPending={mutation.isPending}
				onEmailChange={(topic, isEnabled) =>
					void mutation.run(() => sendSubscriptionEmail(topic.id, isEnabled, topic.ownerUserId))
				}
				elements={OWNER_TOPICS_TABLE_ELEMENTS}
			/>
			{mutation.error && <Text className="text-sm text-destructive">{mutation.error}</Text>}
		</View>
	)
}

// the native cells, the fixed-column table, and a row's scans in a sheet over the screen
const OWNER_TOPICS_TABLE_ELEMENTS: OwnerTopicsTableElements = {
	Text: ({ children }) => <Text className="text-sm text-muted-foreground">{children}</Text>,
	Name: ({ topic }) => <TopicNameLink topic={topic} />,
	Visibility: ({ visibility }) => <TopicVisibility visibility={visibility} />,
	EmailSwitch: ({ topic, isDisabled, onChange }) => (
		<PreferenceSwitch
			label={`${topic.name} emails`}
			isChecked={topic.isEmailEnabled}
			isDisabled={isDisabled}
			onChange={onChange}
		/>
	),
	SubscribersToggle: ({ topic }) => <Text className="text-sm text-muted-foreground">{topic.subscriberCount}</Text>,
	CostToggle: ({ topic, onToggle }) => (
		<Button variant="link" className="px-0" accessibilityLabel={`Brew costs for ${topic.name}`} onPress={onToggle}>
			<Text>{toCentsLabel(topic.monthCostCents)}</Text>
			<Icon as={ChevronDown} className="size-4 text-link" />
		</Button>
	),
	Detail: ({ topic, onClose }) => (
		<Sheet title="Brew costs" onClose={onClose}>
			<TopicScansTable topic={topic} scans={topic.scans} />
		</Sheet>
	),
	Table: ({ topics, columns, renderDetail }) => (
		<>
			<DataTable rows={topics} columns={columns} valueByKey={ownerTopicSortValues} getRowId={(topic) => topic.id} />
			{topics.map((topic) => (
				<Fragment key={topic.id}>{renderDetail(topic)}</Fragment>
			))}
		</>
	),
	EmptyCard: ({ text }) => <EmptyListCard text={text} />,
}
