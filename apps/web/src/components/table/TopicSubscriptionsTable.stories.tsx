// the Activity page's subscriptions table: each subscribed topic's owner, the Active and Emails switches, and the
// delete button, with a pending topic invitation shown as an inactive row
import { fetchTopicInviteBadges, sendAcceptInvite, sendDeclineInvite } from "@carlnotes/client/activityClient"
import { sendDeleteSubscription, sendSubscriptionEmail, sendTopicSubscription } from "@carlnotes/client/topicClient"
import type { SubscriptionRow } from "@carlnotes/contracts/activity"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { fn, mocked, screen } from "storybook/test"
import { FIXTURE_DATE, STORY_PEOPLE, toStoryProfile } from "../../../.storybook/fixtures"
import { toStoryPodcastEpisode } from "../../../.storybook/fixtures/podcastEpisodes"
import { STORY_TEAMS } from "../../../.storybook/fixtures/teams"
import { PAGED_TOPIC_NAMES } from "../../../.storybook/fixtures/topics"
import { TopicSubscriptionsTable } from "./TopicSubscriptionsTable"

// the people who own the subscribed topics
const CARLOS = toStoryProfile(STORY_PEOPLE[1])
const EVAN = toStoryProfile(STORY_PEOPLE[2])

// the latest published podcast episode of the Design systems topic
const designSystemsPodcastEpisode = toStoryPodcastEpisode({
	topic: { id: "topic-design-systems", name: "Design systems" },
	id: "podcast-episode-design-systems-3",
	title: "Tokens that outlive the redesign",
	description: "Three design system releases, and the token naming that held up through a rebrand.",
	episodeNumber: 3,
	durationSeconds: 515,
	chapterCount: 5,
})

// a team topic subscribed with emails on, a subscription switched off, and an invitation the user has not answered
const subscriptions: SubscriptionRow[] = [
	{
		topicId: "topic-design-systems",
		name: "Design systems",
		owner: CARLOS,
		team: STORY_TEAMS.designGuild,
		visibility: "invite",
		subscribedAt: "2026-08-14T12:00:00.000Z",
		isActive: true,
		isEmailEnabled: true,
		inviteId: null,
		latestPodcastEpisode: designSystemsPodcastEpisode,
	},
	{
		topicId: "topic-robot-vacuums",
		name: "Robot vacuums",
		owner: EVAN,
		team: null,
		visibility: "public",
		subscribedAt: "2026-06-01T12:00:00.000Z",
		isActive: false,
		isEmailEnabled: false,
		inviteId: null,
		latestPodcastEpisode: null,
	},
	{
		topicId: "topic-home-espresso",
		name: "Home espresso",
		owner: EVAN,
		team: null,
		visibility: "invite",
		subscribedAt: FIXTURE_DATE.toISOString(),
		isActive: false,
		isEmailEnabled: false,
		inviteId: "invite-home-espresso",
		latestPodcastEpisode: null,
	},
]

// the user's subscription to each of twelve public topics Carlos owns, every other one with emails on
const pagedSubscriptions: SubscriptionRow[] = PAGED_TOPIC_NAMES.map((topicName, i) => ({
	topicId: `topic-paged-${i + 1}`,
	name: topicName,
	owner: CARLOS,
	team: null,
	visibility: "public",
	subscribedAt: FIXTURE_DATE.toISOString(),
	isActive: true,
	isEmailEnabled: i % 2 === 0,
	inviteId: null,
	latestPodcastEpisode: null,
}))

const meta = {
	title: "Table/TopicSubscriptionsTable",
	component: TopicSubscriptionsTable,
	args: { subscriptions, isReadOnly: false, onReloadPage: fn() },
	argTypes: {
		subscriptions: { control: "object" },
		isReadOnly: { control: "boolean" },
		onReloadPage: { control: false },
	},
	parameters: { session: "user" },
	// the switches, the deletes, and the invitation badge reread each resolve without a request
	beforeEach: () => {
		mocked(sendTopicSubscription).mockResolvedValue(undefined)
		mocked(sendSubscriptionEmail).mockResolvedValue(undefined)
		mocked(sendDeleteSubscription).mockResolvedValue(undefined)
		mocked(sendAcceptInvite).mockResolvedValue({
			status: "joined",
			topicId: "topic-home-espresso",
			topicName: "Home espresso",
		})
		mocked(sendDeclineInvite).mockResolvedValue(undefined)
		mocked(fetchTopicInviteBadges).mockResolvedValue([])
	},
} satisfies Meta<typeof TopicSubscriptionsTable>

export default meta
type Story = StoryObj<typeof meta>

// an active team topic with a podcast episode, a subscription switched off, and a pending invitation
export const Default: Story = {}

// the confirmation that the delete button on the Robot vacuums subscription opens
export const DeleteConfirmation: Story = {
	// press the delete button and wait for the dialog
	play: async ({ canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole("button", { name: "Delete the subscription to Robot vacuums" }))
		await screen.findByRole("dialog", { name: "Delete this subscription?" })
	},
}

// the confirmation that the delete button on the pending Home espresso invitation opens
export const DeleteInvitationConfirmation: Story = {
	// press the delete button and wait for the dialog
	play: async ({ canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole("button", { name: "Delete the invitation to Home espresso" }))
		await screen.findByRole("dialog", { name: "Delete this invitation?" })
	},
}

// an admin reading Vienna's Activity page, with disabled switches and no delete buttons
export const ReadOnly: Story = {
	args: { isReadOnly: true },
	parameters: { session: "admin" },
}

// twelve subscriptions over two pages, with the pagination footer under the table
export const Paged: Story = {
	args: { subscriptions: pagedSubscriptions },
}
