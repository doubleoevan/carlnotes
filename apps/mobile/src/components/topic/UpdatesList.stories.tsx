import { UPDATES_STORY } from "@carlnotes/core/lib/updatesStories"
import type { Meta, StoryObj } from "@storybook/react-native"
import { CoffeeLoading } from "@/components/branding/CoffeeLoading"
import { STORY_TOPIC_FEED_HANDLERS } from "./topicFeedStories"
import { UpdatesList } from "./UpdatesList"

// what a row's note does in a story
const STORY_ACTIONS = { handlers: STORY_TOPIC_FEED_HANDLERS, pendingChanges: [] }

// the web card's sections, its missing opener, its empty state, and its loading state
const meta = {
	title: "Topic/UpdatesList",
	component: UpdatesList,
	args: { updates: UPDATES_STORY, actions: STORY_ACTIONS, minutes: 30, onSelectMinutes: () => {} },
} satisfies Meta<typeof UpdatesList>
export default meta
type Story = StoryObj<typeof meta>
export const WithOpener: Story = {}
export const WithoutOpener: Story = { args: { updates: { ...UPDATES_STORY, opener: null } } }
export const Empty: Story = { args: { updates: { ...UPDATES_STORY, findings: [], moreCount: 0 } } }
export const Loading: Story = {
	render: () => (
		<UpdatesList
			actions={STORY_ACTIONS}
			minutes={30}
			onSelectMinutes={() => {}}
			placeholder={<CoffeeLoading className="py-16" />}
		/>
	),
}
