import { authClient } from "@carlnotes/client/authClient"
import { fetchTopicPage } from "@carlnotes/client/topicClient"
import type { Topic } from "@carlnotes/contracts/profiles"
import { TopicsTable as SharedTopicsTable, type TopicsTableElements } from "@carlnotes/core/components/TopicsTable"
import { toRemoveTopicConfirmation } from "@carlnotes/core/lib/confirmationCopy"
import { toKeptOverSeenLabel, topicSortValues } from "@carlnotes/core/lib/topicsTableColumns"
import { useQuery } from "@tanstack/react-query"
import { X } from "lucide-react-native"
import { useState } from "react"
import { View } from "react-native"
import { CoffeeLoading } from "@/components/branding/CoffeeLoading"
import { NoteIcon } from "@/components/branding/NoteIcon"
import { showConfirmAlert } from "@/components/common/ConfirmDialog"
import { PreferenceSwitch } from "@/components/common/PreferenceSwitch"
import { Sheet } from "@/components/common/Sheet"
import { Button } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"
import { Text } from "@/components/primitives/text"
import { TopicInfoContent, TopicVisibility } from "@/components/topic/TopicInfo"
import { DataTable } from "./DataTable"
import { TopicNameLink } from "./TopicNameLink"

/**
 * Renders the web's topics table on native profile and team screens. A team leader's remove asks first.
 */
export function TopicsTable({
	topics,
	includesNonPublicTopics,
	onRemoveTopic,
}: {
	topics: Topic[]
	includesNonPublicTopics: boolean
	onRemoveTopic?: (topic: Topic) => void
}) {
	// taking a topic off the team asks first
	function handleRemoveTopic(topic: Topic): void {
		showConfirmAlert({
			...toRemoveTopicConfirmation({ topicName: topic.name }),
			onConfirm: () => onRemoveTopic?.(topic),
		})
	}
	return (
		<SharedTopicsTable
			topics={topics}
			includesNonPublicTopics={includesNonPublicTopics}
			onRemoveTopic={onRemoveTopic && handleRemoveTopic}
			elements={TOPICS_TABLE_ELEMENTS}
		/>
	)
}

// load details only when the user opens the same kept-over-seen control as the web
function TopicPopover({ topic }: { topic: Topic }) {
	const { data: session } = authClient().useSession()
	const [isOpen, setIsOpen] = useState(false)
	const query = useQuery({
		queryKey: ["topic-info", session?.user.id, topic.id],
		enabled: isOpen,
		queryFn: () => fetchTopicPage(topic.id),
	})
	const label = toKeptOverSeenLabel(topic)
	return (
		<>
			<Button
				variant="link"
				className="px-0"
				accessibilityLabel={`${label} kept, topic roast for ${topic.name}`}
				onPress={() => setIsOpen(true)}
			>
				<Text>{label}</Text>
				<NoteIcon />
			</Button>
			{isOpen && (
				<Sheet title="Topic roast" onClose={() => setIsOpen(false)}>
					{query.data?.status === "visible" ? (
						<TopicInfoContent topic={query.data.topic} onClose={() => setIsOpen(false)} />
					) : query.isPending ? (
						<CoffeeLoading />
					) : (
						<Text>This topic is unavailable.</Text>
					)}
				</Sheet>
			)}
		</>
	)
}

// the native table with the error line under it, and the native cells
const TOPICS_TABLE_ELEMENTS: TopicsTableElements = {
	Table: ({ topics, columns, children }) => (
		<View className="gap-2">
			<DataTable rows={topics} columns={columns} valueByKey={topicSortValues} getRowId={(topic) => topic.id} />
			{children}
		</View>
	),
	Text: ({ children }) => <Text className="text-sm text-muted-foreground">{children}</Text>,
	ErrorText: ({ children }) => <Text className="text-sm text-destructive">{children}</Text>,
	NameLink: TopicNameLink,
	Visibility: TopicVisibility,
	TopicInfo: TopicPopover,
	Switch: PreferenceSwitch,
	RemoveButton: ({ label, onPress }) => (
		<Button variant="ghost" size="icon-sm" accessibilityLabel={label} onPress={onPress}>
			<Icon as={X} className="size-4 text-foreground" />
		</Button>
	),
}
