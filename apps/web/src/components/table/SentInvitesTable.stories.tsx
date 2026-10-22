// the invitations the user sent, which the topic and team invitation tables share: who was invited, when, whether
// they accepted, and the Active switch that withdraws one
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { fn } from "storybook/test"
import { TeamLink } from "@/components/team/TeamLink"
import { FIXTURE_DATE, LLM_TOOLING_TOPIC_FIXTURE, STORY_PEOPLE, toStoryProfile } from "../../../.storybook/fixtures"
import { STORY_TEAMS } from "../../../.storybook/fixtures/teams"
import { findVisibleByRole } from "../../../.storybook/play"
import { type SentInviteRow, SentInvitesTable } from "./SentInvitesTable"
import { TEAM_INVITES_TABLE_LABELS } from "./TeamInvitesTable"
import { TOPIC_INVITES_TABLE_LABELS, toTopicInviteTarget } from "./TopicInvitesTable"

// the people with accounts whom the invitations reached
const [VIENNA, CARLOS, EVAN] = STORY_PEOPLE

// the topics the invitations opened
const LLM_TOOLING_TOPIC = { topicId: LLM_TOOLING_TOPIC_FIXTURE.id, name: LLM_TOOLING_TOPIC_FIXTURE.name }
const VECTOR_DATABASES_TOPIC = { topicId: "topic-vector-databases", name: "Vector databases" }

// a username invitation that was accepted, an email invitation still pending, and an email invitation that reached an
// account and is still pending
const TOPIC_INVITE_ROWS: SentInviteRow[] = [
	{
		inviteId: "invite-carlos",
		...toTopicInviteTarget(LLM_TOOLING_TOPIC),
		invitee: toStoryProfile(CARLOS),
		inviteeEmail: null,
		invitedAt: FIXTURE_DATE.toISOString(),
		acceptedAt: FIXTURE_DATE.toISOString(),
	},
	{
		inviteId: "invite-pat",
		...toTopicInviteTarget(LLM_TOOLING_TOPIC),
		invitee: null,
		inviteeEmail: "pat@example.com",
		invitedAt: FIXTURE_DATE.toISOString(),
		acceptedAt: null,
	},
	{
		inviteId: "invite-evan",
		...toTopicInviteTarget(VECTOR_DATABASES_TOPIC),
		invitee: toStoryProfile(EVAN),
		inviteeEmail: "evan@example.com",
		invitedAt: FIXTURE_DATE.toISOString(),
		acceptedAt: null,
	},
]

// the team the team invitations opened
const READING_GROUP_TEAM = STORY_TEAMS.readingGroup

// a team invitation that was joined and one still pending
const TEAM_INVITE_ROWS: SentInviteRow[] = [
	{
		inviteId: "invite-vienna",
		target: <TeamLink team={READING_GROUP_TEAM} label="" />,
		targetName: READING_GROUP_TEAM.name,
		invitee: toStoryProfile(VIENNA),
		inviteeEmail: null,
		invitedAt: FIXTURE_DATE.toISOString(),
		acceptedAt: FIXTURE_DATE.toISOString(),
	},
	{
		inviteId: "invite-robin",
		target: <TeamLink team={READING_GROUP_TEAM} label="" />,
		targetName: READING_GROUP_TEAM.name,
		invitee: null,
		inviteeEmail: "robin@example.com",
		invitedAt: FIXTURE_DATE.toISOString(),
		acceptedAt: null,
	},
]

const meta = {
	title: "Table/SentInvitesTable",
	component: SentInvitesTable,
	args: {
		...TOPIC_INVITES_TABLE_LABELS,
		inviteRows: TOPIC_INVITE_ROWS,
		onDeleteInvite: fn(async () => {}),
	},
	argTypes: {
		inviteRows: { control: false },
		targetLabel: { control: "text" },
		acceptedLabel: { control: "text" },
		acceptedNoun: { control: "text" },
		confirmTitle: { control: "text" },
		confirmLabel: { control: "text" },
		confirmBody: { control: false },
		onDeleteInvite: { control: false },
	},
	parameters: { session: "user" },
} satisfies Meta<typeof SentInvitesTable>

export default meta
type Story = StoryObj<typeof meta>

// the Activity page's topic invitations, each with its Active switch
export const TopicInvitations: Story = {}

// the team page's team invitations, worded for joining a team
export const TeamInvitations: Story = {
	args: { ...TEAM_INVITES_TABLE_LABELS, inviteRows: TEAM_INVITE_ROWS },
}

// an admin reading another user's invitations, with no Active column to withdraw one
export const ReadOnly: Story = { args: { onDeleteInvite: undefined } }

// the withdraw confirmation a click on a pending invitation's Active switch opens
export const ConfirmWithdraw: Story = {
	play: async ({ canvas, userEvent }) => {
		// the confirmation fades and zooms in, so it is visible once the animation ends
		await userEvent.click(canvas.getByRole("switch", { name: "Withdraw the invitation to pat@example.com" }))
		await findVisibleByRole("dialog")
	},
}
