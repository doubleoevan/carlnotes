import { PersonalSourceCard } from "@carlnotes/core/components/PersonalSourceCard"
import { PERSONAL_SOURCES_SOURCE_STORY, usePersonalSourceStory } from "@carlnotes/core/lib/personalSourcesStories"
import type { Meta, StoryObj } from "@storybook/react-native"
import { PERSONAL_SOURCES_ELEMENTS } from "./personalSourcesElements"

// compare the same entries and interactions at the browser's phone width
const meta = {
	title: "Topic/PersonalSourceCard",
	component: PersonalSourceCard,
	render: () => <SourceStory />,
	parameters: { webReference: "apps/web/src/components/topic/PersonalSourceCard.stories.tsx at 375px" },
} satisfies Meta<typeof PersonalSourceCard>
export default meta
type Story = StoryObj
export const Ready: Story = {}
export const DeleteConfirmation: Story = { render: () => <SourceStory variant="confirmation" /> }
export const Failed: Story = { render: () => <SourceStory variant="failed" /> }
export const Disconnected: Story = { render: () => <SourceStory isDisconnected /> }

function SourceStory({
	variant,
	isDisconnected = false,
}: {
	variant?: Parameters<typeof usePersonalSourceStory>[0]
	isDisconnected?: boolean
}) {
	const state = usePersonalSourceStory(variant)
	return (
		<PersonalSourceCard
			source={{ ...PERSONAL_SOURCES_SOURCE_STORY, isConnected: !isDisconnected }}
			state={state}
			elements={PERSONAL_SOURCES_ELEMENTS}
		/>
	)
}
