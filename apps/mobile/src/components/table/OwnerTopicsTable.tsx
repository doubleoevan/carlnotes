import { sendSubscriptionEmail } from "@carlnotes/client/topicClient"
import type { OwnerTopic } from "@carlnotes/contracts/activity"
import { toCentsLabel } from "@carlnotes/core/lib/labels"
import { ownerTopicSortValues, toOwnerTopicsTableColumns } from "@carlnotes/core/lib/ownerTopicsTableColumns"
import { ChevronDown } from "lucide-react-native"
import { useState } from "react"
import { View } from "react-native"
import { PreferenceSwitch } from "@/components/common/PreferenceSwitch"
import { Sheet } from "@/components/common/Sheet"
import { Button } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"
import { Text } from "@/components/primitives/text"
import { TopicVisibility } from "@/components/topic/TopicInfo"
import { usePageMutation } from "@/hooks/usePageMutation"
import { DataTable } from "./DataTable"
import { TopicNameLink } from "./TopicNameLink"
import { TopicScansTable } from "./TopicScansTable"

/**
 * Shows owner topic columns with scan details in a native sheet.
 */
export function OwnerTopicsTable({ topics, onReloadPage }: { topics: OwnerTopic[]; onReloadPage: () => void }) {
	// keep the selected topic separate from paging and server refreshes
	const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null)
	const selectedTopic = topics.find((topic) => topic.id === selectedTopicId)
	const mutation = usePageMutation(onReloadPage)
	const columns = toOwnerTopicsTableColumns({
		topics,
		renderText: (text) => <Text className="text-sm text-muted-foreground">{text}</Text>,
		renderName: (topic) => <TopicNameLink topic={topic} />,
		renderSubscribers: (topic) => <Text className="text-sm">{topic.subscriberCount}</Text>,
		renderVisibility: (topic) => <TopicVisibility visibility={topic.visibility} />,
		renderEmail: (topic) => (
			<PreferenceSwitch
				label={`${topic.name} emails`}
				isChecked={topic.isEmailEnabled}
				isDisabled={mutation.isPending}
				onChange={(isEnabled) => void mutation.run(() => sendSubscriptionEmail(topic.id, isEnabled, topic.ownerUserId))}
			/>
		),
		renderCost: (topic) => (
			<Button
				variant="link"
				className="px-0"
				accessibilityLabel={`Brew costs for ${topic.name}`}
				onPress={() => setSelectedTopicId(topic.id)}
			>
				<Text>{toCentsLabel(topic.monthCostCents)}</Text>
				<Icon as={ChevronDown} className="size-4 text-link" />
			</Button>
		),
	})
	return (
		<View className="gap-2">
			<DataTable rows={topics} columns={columns} valueByKey={ownerTopicSortValues} getRowId={(topic) => topic.id} />
			{mutation.error && <Text className="text-destructive">{mutation.error}</Text>}
			{selectedTopic && (
				<Sheet title="Brew costs" onClose={() => setSelectedTopicId(null)}>
					<TopicScansTable topic={selectedTopic} scans={selectedTopic.scans} />
				</Sheet>
			)}
		</View>
	)
}
