import type { UpdatesMinutes, UpdatesResponse } from "@carlnotes/contracts/updates"
import { UpdatesList as SharedUpdatesList, type UpdatesListElements } from "@carlnotes/core/components/UpdatesList"
import type { TopicFindingActions } from "@carlnotes/core/hooks/useTopicFindingActions"
import { toReadingTimeLabel } from "@carlnotes/core/lib/labels"
import { Coffee } from "lucide-react-native"
import type { ReactNode } from "react"
import { View } from "react-native"
import { Icon } from "@/components/primitives/icon"
import { Text } from "@/components/primitives/text"
import { SearchRowTopicLink } from "@/components/search/SearchRowTopicLink"
import { TopicResource } from "./TopicResource"
import { UpdatesButton } from "./UpdatesButton"

// the native elements the shared list composes. the page's type matches the web page's
const UPDATES_LIST_ELEMENTS: UpdatesListElements = {
	Card: ({ children }) => (
		<View className="rounded-lg border border-separator bg-card p-5 shadow-raised">{children}</View>
	),
	Heading: ({ action, children }) => (
		<View className="mb-4 flex-row items-center justify-between gap-3">
			<View className="shrink flex-row items-center gap-2">
				<Icon as={Coffee} className="size-6 text-foreground" />
				<Text accessibilityRole="header" className="shrink font-display text-2xl">
					{children}
				</Text>
			</View>
			{action}
		</View>
	),
	Opener: ({ children }) => <Text className="mb-4 leading-relaxed">{children}</Text>,
	EmptyState: ({ children }) => <Text className="text-sm text-muted-foreground">{children}</Text>,
}

/**
 * Shows a list with the feed's rows, the app's links, and the Update button.
 */
export function UpdatesList({
	updates,
	actions,
	placeholder,
	minutes,
	onSelectMinutes,
}: {
	updates?: UpdatesResponse
	actions: TopicFindingActions
	placeholder?: ReactNode
	// the list's length, and what choosing a length in the Update button does
	minutes: UpdatesMinutes
	onSelectMinutes: (minutes: UpdatesMinutes) => void
}) {
	return (
		<SharedUpdatesList
			updates={updates}
			findings={updates && <UpdatesFindings updates={updates} actions={actions} />}
			placeholder={placeholder}
			action={<UpdatesButton minutes={minutes} onSelect={onSelectMinutes} />}
			elements={UPDATES_LIST_ELEMENTS}
		/>
	)
}

// each Finding as the feed shows it, with its Topic and reading time
function UpdatesFindings({ updates, actions }: { updates: UpdatesResponse; actions: TopicFindingActions }) {
	return updates.findings.map((finding, index) => {
		const topic = updates.topics.find(({ id }) => id === finding.topicId)
		return (
			topic && (
				<TopicResource
					key={finding.findingId}
					resource={finding}
					topic={topic}
					topicFindingRank={index + 1}
					isBookmarkOnLine
					isLast={index === updates.findings.length - 1}
					latestPodcastEpisode={updates.podcastEpisodes.find((podcastEpisode) => podcastEpisode.topicId === topic.id)}
					topicFeedHandlers={actions.handlers}
					isPending={actions.pendingChanges.some((change) => change.findingId === finding.findingId)}
				>
					<SearchRowTopicLink topic={topic} prefix="in " />
					<Text className="text-xs text-muted-foreground">{`· ${toReadingTimeLabel(finding)}`}</Text>
				</TopicResource>
			)
		)
	})
}
