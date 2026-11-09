import { UPDATES_STORY } from "@carlnotes/core/lib/updatesStories"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { fn } from "storybook/test"
import { CoffeeLoading } from "@/components/branding/CoffeeLoading"
import { UpdatesList } from "./UpdatesList"

// what a row's note does in a story
const TOPIC_FEED_HANDLERS = {
	openTopicFinding: fn(),
	consumeTopicFinding: fn(),
	rateTopicFinding: fn(),
	bookmarkTopicFinding: fn(),
	keepTopicFindingReactions: fn(),
}

const meta = {
	title: "Topic/UpdatesList",
	component: UpdatesList,
	args: { updates: UPDATES_STORY, topicFeedHandlers: TOPIC_FEED_HANDLERS, minutes: 30, onSelectMinutes: fn() },
	decorators: [
		(Story) => (
			<div className="max-w-xl">
				<Story />
			</div>
		),
	],
} satisfies Meta<typeof UpdatesList>
export default meta
type Story = StoryObj<typeof meta>
export const WithOpener: Story = {}
export const WithoutOpener: Story = { args: { updates: { ...UPDATES_STORY, opener: null } } }
export const Empty: Story = { args: { updates: { ...UPDATES_STORY, findings: [], moreCount: 0 } } }
export const Loading: Story = {
	render: () => (
		<UpdatesList
			placeholder={<CoffeeLoading className="min-h-24 text-base" />}
			topicFeedHandlers={TOPIC_FEED_HANDLERS}
			minutes={30}
			onSelectMinutes={fn()}
		/>
	),
}
