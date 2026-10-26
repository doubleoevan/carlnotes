import { toTestTopicFeed, toTestTopicFinding } from "@carlnotes/contracts/topicFeedTestFixtures"
import { applyTopicFindingChanges, type TopicFindingChange } from "@carlnotes/core/lib/topicFindingChanges"
import { matchesTopicFindingFilter } from "@carlnotes/core/lib/topicFindingFilters"
import type { Meta, StoryObj } from "@storybook/react-native"
import { useState } from "react"
import { View } from "react-native"
import { Button } from "@/components/primitives/button"
import { Text } from "@/components/primitives/text"
import { toTopicFindingRows } from "@/topicFeedRows"
import { TopicFindingList } from "./TopicFindingList"
import { STORY_TOPIC_FEED_HANDLERS } from "./topicFeedStories"

// several rows share exactly one shadow and one border
const meta = {
	title: "Topic/TopicFindingList",
	component: TopicFindingList,
	parameters: { webReference: "apps/web/src/components/topic/TopicFindingsSection.tsx#TopicFindingList" },
	args: {
		topic: toTestTopicFeed(),
		findingRows: toTopicFindingRows(
			Array.from({ length: 5 }, (_, index) =>
				toTestTopicFinding({ findingId: `finding-${index}`, title: `Coffee finding ${index + 1}` }),
			),
		),
		state: { handlers: STORY_TOPIC_FEED_HANDLERS, pendingChanges: [] },
	},
} satisfies Meta<typeof TopicFindingList>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
export const Single: Story = { args: { findingRows: toTopicFindingRows([toTestTopicFinding()]) } }

// exercise list removal and restoration without sending a real rating
export const RatingRemovalAndRollback: Story = { render: () => <RatingRemovalStory /> }

function RatingRemovalStory() {
	// keep saved and tentative states separate while using the app's shared transformation and filter
	const [phase, setPhase] = useState<"pending" | "saved" | null>(null)
	const topic = toTestTopicFeed({
		findings: Array.from({ length: 3 }, (_, index) =>
			toTestTopicFinding({
				findingId: `finding-${index}`,
				title: `Coffee finding ${index + 1}`,
			}),
		),
	})
	const changes: TopicFindingChange[] = phase ? [{ kind: "rating", findingId: "finding-0", rating: "down" }] : []
	const changedTopic = applyTopicFindingChanges(topic, changes)
	const findings = changedTopic.findings.filter((finding) => matchesTopicFindingFilter(finding, "all"))
	return (
		<View className="gap-3">
			<Text>
				{phase === "pending" ? "Rating pending" : phase === "saved" ? "Rating saved" : "Three visible findings"}
			</Text>
			<View className="flex-row flex-wrap gap-2">
				<Button accessibilityLabel="Rate first finding down" onPress={() => setPhase("pending")}>
					<Text>Rate down</Text>
				</Button>
				<Button
					accessibilityLabel="Confirm successful rating"
					disabled={phase !== "pending"}
					onPress={() => setPhase("saved")}
				>
					<Text>Save rating</Text>
				</Button>
				<Button
					accessibilityLabel="Restore finding after failed save"
					disabled={phase === null}
					onPress={() => setPhase(null)}
				>
					<Text>Restore finding</Text>
				</Button>
			</View>
			<TopicFindingList
				topic={changedTopic}
				findingRows={toTopicFindingRows(findings)}
				state={{
					handlers: STORY_TOPIC_FEED_HANDLERS,
					pendingChanges: phase === "pending" ? changes : [],
				}}
			/>
		</View>
	)
}
