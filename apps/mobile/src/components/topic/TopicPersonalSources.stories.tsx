import { TopicPersonalSourcesStory } from "@carlnotes/core/components/TopicPersonalSourcesStory"
import type { Meta, StoryObj } from "@storybook/react-native"
import { PERSONAL_SOURCES_ELEMENTS } from "./personalSourcesElements"
import { TopicPersonalSources } from "./TopicPersonalSources"

// show the real platform wrapper with loaded state and local actions
const meta = {
	title: "Topic/TopicPersonalSources",
	component: TopicPersonalSourcesStory,
	parameters: { webReference: "apps/web/src/components/topic/TopicPersonalSources.stories.tsx at 375px" },
	args: { Component: TopicPersonalSources, elements: PERSONAL_SOURCES_ELEMENTS },
} satisfies Meta<typeof TopicPersonalSourcesStory>
export default meta
type Story = StoryObj<typeof meta>
export const WithItems: Story = {}
export const Empty: Story = { args: { variant: "empty" } }
export const Loading: Story = { args: { variant: "loading" } }
export const Failed: Story = { args: { variant: "failed" } }
