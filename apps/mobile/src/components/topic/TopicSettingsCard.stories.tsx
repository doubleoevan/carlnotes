import { toTestTopicResponse } from "@carlnotes/contracts/topicFeedTestFixtures"
import type { ExpandableRowProps } from "@carlnotes/core/components/ExpandableRow"
import { TopicPersonalSourcesSectionStory } from "@carlnotes/core/components/TopicPersonalSourcesSectionStory"
import type { Meta, StoryObj } from "@storybook/react-native"
import { ScrollView } from "react-native"
import { ExpandableRow } from "@/components/primitives/expandable-row"
import { PERSONAL_SOURCES_ELEMENTS } from "./personalSourcesElements"
import { TopicSettingsCard } from "./TopicSettingsCard"

// use the same section fixtures as Topic info inside the real Artisanal Blend card
const meta = {
	title: "Topic/TopicSettingsCard",
	component: TopicSettingsCard,
	parameters: { webReference: "apps/web/src/components/topic/TopicSettingsCard.stories.tsx at 375px" },
	args: { topic: toTestTopicResponse() },
} satisfies Meta<typeof TopicSettingsCard>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = { render: () => <SettingsStory isClosed /> }
export const Collapsed: Story = { render: () => <SettingsStory isClosed /> }
export const WithItems: Story = { render: () => <SettingsStory /> }
export const ItemExpanded: Story = { render: () => <SettingsStory isExpanded /> }
export const Empty: Story = { render: () => <SettingsStory isEmpty /> }

// keep the adapter identity stable while the shared row owns its disclosure state
export const Paginated: Story = { render: () => <SettingsStory isPaged /> }
function ExpandedRow(props: ExpandableRowProps) {
	return <ExpandableRow {...props} initialOpen />
}
const EXPANDED_ELEMENTS = { ...PERSONAL_SOURCES_ELEMENTS, ExpandableRow: ExpandedRow }
function SettingsStory({
	isExpanded = false,
	isEmpty = false,
	isClosed = false,
	isPaged = false,
}: {
	isExpanded?: boolean
	isEmpty?: boolean
	isClosed?: boolean
	isPaged?: boolean
}) {
	return (
		<ScrollView className="w-full">
			<TopicSettingsCard
				topic={toTestTopicResponse()}
				personalSources={
					<TopicPersonalSourcesSectionStory
						elements={PERSONAL_SOURCES_ELEMENTS}
						expandedElements={EXPANDED_ELEMENTS}
						isItemExpanded={isExpanded}
						initialOpen={!isClosed}
						variant={isEmpty ? "empty" : isPaged ? "paged" : "ready"}
					/>
				}
			/>
		</ScrollView>
	)
}
