// the Activity page's topic invitations table: who the user invited to their topics, whether each one subscribed, and
// the Active switch that deletes an invitation after a confirmation
import { sendDeleteTopicInvite } from "@carlnotes/client/activityClient"
import type { InviteRow } from "@carlnotes/contracts/invites"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { fn, mocked, screen } from "storybook/test"
import { FIXTURE_DATE, LLM_TOOLING_TOPIC_FIXTURE, STORY_PEOPLE, toStoryProfile } from "../../../.storybook/fixtures"
import { TopicInvitesTable } from "./TopicInvitesTable"

// the topics the invitations open
const LLM_TOOLING_TOPIC = { topicId: LLM_TOOLING_TOPIC_FIXTURE.id, name: LLM_TOOLING_TOPIC_FIXTURE.name }
const CLIMBING_GYMS_TOPIC = { topicId: "topic-climbing-gyms", name: "Climbing gyms" }

// an email invitation that reached Carlos's account and that Carlos accepted, a username invitation Evan has not
// answered, and an email invitation to an address with no account yet
const topicInvites: InviteRow[] = [
	{
		...LLM_TOOLING_TOPIC,
		inviteId: "invite-carlos",
		inviteeEmail: "carlos@example.com",
		invitee: toStoryProfile(STORY_PEOPLE[1]),
		invitedAt: "2026-09-02T12:00:00.000Z",
		subscribedAt: "2026-09-03T12:00:00.000Z",
	},
	{
		...LLM_TOOLING_TOPIC,
		inviteId: "invite-evan",
		inviteeEmail: null,
		invitee: toStoryProfile(STORY_PEOPLE[2]),
		invitedAt: "2026-09-20T12:00:00.000Z",
		subscribedAt: null,
	},
	{
		...CLIMBING_GYMS_TOPIC,
		inviteId: "invite-jake",
		inviteeEmail: "jake@example.com",
		invitee: null,
		invitedAt: FIXTURE_DATE.toISOString(),
		subscribedAt: null,
	},
]

// twelve email invitations to the LLM tooling topic, every third one accepted, enough for a second page
const pagedTopicInvites: InviteRow[] = Array.from({ length: 12 }, (_, i) => ({
	...LLM_TOOLING_TOPIC,
	inviteId: `invite-paged-${i + 1}`,
	inviteeEmail: `invitee${i + 1}@example.com`,
	invitee: null,
	invitedAt: FIXTURE_DATE.toISOString(),
	subscribedAt: i % 3 === 0 ? FIXTURE_DATE.toISOString() : null,
}))

const meta = {
	title: "Table/TopicInvitesTable",
	component: TopicInvitesTable,
	args: { invites: topicInvites, isReadOnly: false, onReload: fn() },
	argTypes: {
		invites: { control: "object" },
		isReadOnly: { control: "boolean" },
		onReload: { control: false },
	},
	parameters: { session: "user" },
	// deleting an invitation resolves without a request
	beforeEach: () => {
		mocked(sendDeleteTopicInvite).mockResolvedValue(undefined)
	},
} satisfies Meta<typeof TopicInvitesTable>

export default meta
type Story = StoryObj<typeof meta>

// an accepted invitation and two pending ones, each with its Active switch
export const Default: Story = {}

// the confirmation that switching Carlos's invitation off opens
export const DeleteConfirmation: Story = {
	// switch the invitation off and wait for the dialog
	play: async ({ canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole("switch", { name: "Withdraw the invitation to carlos@example.com" }))
		await screen.findByRole("dialog", { name: "Delete this invitation?" })
	},
}

// an admin reading Vienna's Activity page, with no Active column
export const ReadOnly: Story = {
	args: { isReadOnly: true },
	parameters: { session: "admin" },
}

// twelve invitations over two pages, with the pagination footer under the table
export const Paged: Story = {
	args: { invites: pagedTopicInvites },
}
