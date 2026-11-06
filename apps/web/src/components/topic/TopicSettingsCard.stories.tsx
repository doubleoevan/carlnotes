import { toTestTopicResponse } from "@carlnotes/contracts/topicFeedTestFixtures"
import { TopicPersonalSourcesSectionStory } from "@carlnotes/core/components/TopicPersonalSourcesSectionStory"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
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
export const EntryExpanded: Story = { render: () => <SettingsStory isExpanded /> }
export const Empty: Story = { render: () => <SettingsStory isEmpty /> }

export const Paginated: Story = { render: () => <SettingsStory isPaged /> }
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
		<TopicSettingsCard
			topic={toTestTopicResponse()}
			personalSources={
				<TopicPersonalSourcesSectionStory
					className="border-b border-dashed border-separator-strong"
					elements={PERSONAL_SOURCES_ELEMENTS}
					isEntryExpanded={isExpanded}
					initialOpen={!isClosed}
					variant={isEmpty ? "empty" : isPaged ? "paged" : "ready"}
				/>
			}
		/>
	)
}
