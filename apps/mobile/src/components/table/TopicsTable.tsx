import { authClient } from "@carlnotes/client/authClient"
import { fetchTopicPage } from "@carlnotes/client/topicClient"
import type { Topic } from "@carlnotes/contracts/profiles"
import { useTopicEmails } from "@carlnotes/core/hooks/useTopicEmails"
import { topicSortValues, toTopicsTableColumns } from "@carlnotes/core/lib/topicsTableColumns"
import { useQuery } from "@tanstack/react-query"
import { X } from "lucide-react-native"
import { useState } from "react"
import { View } from "react-native"
import { CoffeeLoading } from "@/components/branding/CoffeeLoading"
import { NoteIcon } from "@/components/branding/NoteIcon"
import { PreferenceSwitch } from "@/components/common/PreferenceSwitch"
import { Sheet } from "@/components/common/Sheet"
import { Button } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"
import { Text } from "@/components/primitives/text"
import { TopicInfoContent, TopicVisibility } from "@/components/topic/TopicInfo"
import { DataTable } from "./DataTable"
import { TopicNameLink } from "./TopicNameLink"

/**
 * Uses the web's shared topic columns on native profile and team screens.
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
	const emails = useTopicEmails()
	const columns = toTopicsTableColumns({
		topics,
		includesNonPublicTopics,
		renderText: (text) => <Text className="text-sm text-muted-foreground">{text}</Text>,
		renderName: (topic) => <TopicNameLink topic={topic} />,
		renderVisibility: (topic) => <TopicVisibility visibility={topic.visibility} />,
		renderInfo: (topic) => <TopicPopover topic={topic} />,
		renderEmail: (topic) => (
			<PreferenceSwitch
				label={`Email me ${topic.name}`}
				isChecked={emails.choices[topic.id] ?? topic.isEmailEnabled ?? false}
				isDisabled={emails.pending[topic.id]}
				onChange={(isEnabled) => void emails.setEmail(topic.id, isEnabled)}
			/>
		),
		renderActive: onRemoveTopic
			? (topic) => (
					<PreferenceSwitch label={`Deactivate ${topic.name}`} isChecked onChange={() => onRemoveTopic(topic)} />
				)
			: undefined,
		renderRemove: onRemoveTopic
			? (topic) => (
					<Button
						variant="ghost"
						size="icon-sm"
						accessibilityLabel={`Remove ${topic.name} from the team`}
						onPress={() => onRemoveTopic(topic)}
					>
						<Icon as={X} className="size-4 text-foreground" />
					</Button>
				)
			: undefined,
	})
	return (
		<View className="gap-2">
			<DataTable rows={topics} columns={columns} valueByKey={topicSortValues} getRowId={(topic) => topic.id} />
			{emails.error && <Text className="text-sm text-destructive">{emails.error}</Text>}
		</View>
	)
}

// load details only when the user opens the same kept/reviewed control as the web
function TopicPopover({ topic }: { topic: Topic }) {
	const { data: session } = authClient().useSession()
	const [isOpen, setIsOpen] = useState(false)
	const query = useQuery({
		queryKey: ["topic-info", session?.user.id, topic.id],
		enabled: isOpen,
		queryFn: () => fetchTopicPage(topic.id),
	})
	const label = `${topic.keptCount.toLocaleString()} / ${topic.seenCount.toLocaleString()}`
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
						<TopicInfoContent topic={query.data.topic} />
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
