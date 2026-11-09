// the admin console's home order section: both pin lists, a step down that saves, a clear after a confirmation, and
// the empty lists
import { sendPodcastEpisodeHomeOrder } from "@carlnotes/client/podcastEpisodeClient"
import { sendTopicHomeOrder } from "@carlnotes/client/topicClient"
import type { HomeTopic } from "@carlnotes/contracts/admin"
import type { HomePodcastEpisode } from "@carlnotes/contracts/podcast"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { expect, fn, mocked, screen, waitFor, within } from "storybook/test"
import { HomeOrderCard } from "./HomeOrderCard"

// two pinned topics and one pinned podcast episode
const HOME_TOPICS: HomeTopic[] = [
	{ id: "topic-llm-tooling", name: "LLM tooling", homeOrder: 1 },
	{ id: "topic-home-espresso", name: "Home espresso", homeOrder: 2 },
]
const HOME_PODCAST_EPISODES: HomePodcastEpisode[] = [
	{
		id: "episode-1",
		title: "Grinders, scales, and the pour",
		topicName: "Home espresso",
		pagePath: "/topics/topic-home-espresso/home-espresso/episodes/2026/4",
		homeOrder: 1,
	},
]

const meta = {
	title: "Admin/HomeOrderCard",
	component: HomeOrderCard,
	args: { homeTopics: HOME_TOPICS, homePodcastEpisodes: HOME_PODCAST_EPISODES, onSaved: fn() },
	argTypes: {
		homeTopics: { control: false },
		homePodcastEpisodes: { control: false },
		onSaved: { control: false },
	},
	parameters: { session: "admin" },
	// a move succeeds unless a story says otherwise
	beforeEach: () => {
		mocked(sendTopicHomeOrder).mockResolvedValue(undefined)
		mocked(sendPodcastEpisodeHomeOrder).mockResolvedValue(undefined)
	},
} satisfies Meta<typeof HomeOrderCard>

export default meta
type Story = StoryObj<typeof meta>

// both lists with their rows
export const Default: Story = {}

// nothing pinned on either list
export const Empty: Story = { args: { homeTopics: [], homePodcastEpisodes: [] } }

// a step down sends the next position and reloads the console
export const MovedDown: Story = {
	play: async ({ canvas, userEvent, args }) => {
		await userEvent.click(canvas.getByRole("button", { name: "Move LLM tooling down" }))
		await waitFor(() => expect(mocked(sendTopicHomeOrder)).toHaveBeenCalledWith("topic-llm-tooling", 2))
		await waitFor(() => expect(args.onSaved).toHaveBeenCalled())
	},
}

// the X asks for confirmation, then clears the pin and reloads the console
export const Cleared: Story = {
	play: async ({ canvas, userEvent, args }) => {
		await userEvent.click(canvas.getByRole("button", { name: "Remove Home espresso from the featured topics" }))
		// nothing is sent until the removal is confirmed
		await expect(mocked(sendTopicHomeOrder)).not.toHaveBeenCalled()
		const confirmDialog = within(await screen.findByRole("dialog", { name: "Remove from featured topics?" }))
		await userEvent.click(confirmDialog.getByRole("button", { name: "Remove" }))
		await waitFor(() => expect(mocked(sendTopicHomeOrder)).toHaveBeenCalledWith("topic-home-espresso", 0))
		await waitFor(() => expect(args.onSaved).toHaveBeenCalled())
	},
}
