// the topic table the profile page and the team pages share: each topic's dates, visibility, subscriber count, kept
// over reviewed findings, the user's scan emails, and a team leader's Active and remove columns
import { fetchTopicPage, sendSubscriptionEmail } from "@carlnotes/client/topicClient"
import type { Topic } from "@carlnotes/contracts/profiles"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { fn, mocked } from "storybook/test"
import { LLM_TOOLING_TOPIC_FIXTURE } from "../../../.storybook/fixtures"
import { LATEST_PODCAST_EPISODE_FIXTURE } from "../../../.storybook/fixtures/podcastEpisodes"
import { PAGED_TOPIC_NAMES, toStoryTopic } from "../../../.storybook/fixtures/topics"
import { TopicsTable } from "./TopicsTable"

// someone else's public topics, none of which the user subscribes to
const profileTopics: Topic[] = [
	toStoryTopic({ id: "topic-robot-vacuums", name: "Robot vacuums", keptCount: 12, seenCount: 96, subscriberCount: 8 }),
	toStoryTopic({ id: "topic-home-espresso", name: "Home espresso", createdAt: "2026-05-18T12:00:00.000Z" }),
	toStoryTopic({ id: "topic-trail-running", name: "Trail running shoes", keptCount: 40, seenCount: 310 }),
]

// another user's topics in every visibility, two of them subscribed to by the admin with scan emails on or off
const adminProfileTopics: Topic[] = [
	toStoryTopic({
		...LLM_TOOLING_TOPIC_FIXTURE,
		subscriberCount: 14,
		isEmailEnabled: true,
		latestPodcastEpisode: LATEST_PODCAST_EPISODE_FIXTURE,
	}),
	toStoryTopic({ id: "topic-climbing-gyms", name: "Climbing gyms", visibility: "invite", isEmailEnabled: false }),
	toStoryTopic({ id: "topic-tax-law", name: "Tax law changes", visibility: "private", subscriberCount: 0 }),
]

// the topics a team holds, which its leader can deactivate or remove
const teamTopics: Topic[] = [
	toStoryTopic({ ...LLM_TOOLING_TOPIC_FIXTURE, latestPodcastEpisode: LATEST_PODCAST_EPISODE_FIXTURE }),
	toStoryTopic({ id: "topic-design-systems", name: "Design systems", visibility: "invite", isEmailEnabled: true }),
]

// the twelve topics, each with its own counts
const pagedTopics: Topic[] = PAGED_TOPIC_NAMES.map((topicName, i) =>
	toStoryTopic({
		id: `topic-paged-${i + 1}`,
		name: topicName,
		keptCount: 10 + i * 3,
		seenCount: 90 + i * 20,
		subscriberCount: i,
	}),
)

const meta = {
	title: "Table/TopicsTable",
	component: TopicsTable,
	args: { topics: profileTopics, includesNonPublicTopics: false },
	argTypes: {
		topics: { control: "object" },
		includesNonPublicTopics: { control: "boolean" },
		topicTooltip: { control: "text" },
		className: { control: "text" },
		onRemoveTopic: { control: false },
	},
	// the email switch writes the user's subscription, and the kept cell's popover reads a topic with no page to show
	beforeEach: () => {
		mocked(sendSubscriptionEmail).mockResolvedValue(undefined)
		mocked(fetchTopicPage).mockResolvedValue({ status: "missing" })
	},
} satisfies Meta<typeof TopicsTable>

export default meta
type Story = StoryObj<typeof meta>

// someone else's profile: public topics only, so no Visibility column, and no Emails column without a subscription
export const Profile: Story = {}

// an admin reading another user's profile: every visibility, so the Visibility column, and the Emails column for the
// admin's own subscriptions. the user's own profile shows OwnerTopicsTable instead
export const AdminProfile: Story = {
	args: { topics: adminProfileTopics, includesNonPublicTopics: true },
	parameters: { session: "admin" },
}

// a team page for its leader: the Active switch and the remove button on every topic
export const TeamLeader: Story = {
	args: {
		topics: teamTopics,
		includesNonPublicTopics: true,
		topicTooltip: "Topics on this team",
		onRemoveTopic: fn(),
	},
}

// twelve topics over two pages, with the pagination footer under the table
export const Paged: Story = {
	args: { topics: pagedTopics },
}

// no topics, which renders nothing so each page shows its own empty state
export const Empty: Story = {
	args: { topics: [] },
}
