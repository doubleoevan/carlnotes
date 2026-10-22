// the Teams page's team invitations table: who the member invited to their team and whether each one joined
import { sendDeleteTeamInvite } from "@carlnotes/client/teamClient"
import type { TeamIdentity, TeamsPageResponse } from "@carlnotes/contracts/teams"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { fn, mocked } from "storybook/test"
import { STORY_PEOPLE, toStoryProfile } from "../../../.storybook/fixtures"
import { STORY_TEAMS } from "../../../.storybook/fixtures/teams"
import { SentTeamInvitesTable } from "./TeamInvitesTable"

// one invitation the member sent, as the teams page payload sends it
type SentTeamInvite = TeamsPageResponse["sentInvites"][number]

// the teams the invitations open
const MODEL_WATCHERS: TeamIdentity = STORY_TEAMS.modelWatchers
const BATTERY_READERS: TeamIdentity = STORY_TEAMS.batteryReaders

// invitations in each state: joined, waiting on an account invited by email, and waiting on an address alone
const SENT_TEAM_INVITES: SentTeamInvite[] = [
	{
		...MODEL_WATCHERS,
		inviteId: "invite-carlos",
		inviteeEmail: null,
		invitee: toStoryProfile(STORY_PEOPLE[1]),
		invitedAt: "2026-08-12T12:00:00.000Z",
		joinedAt: "2026-08-14T12:00:00.000Z",
	},
	{
		...BATTERY_READERS,
		inviteId: "invite-evan",
		inviteeEmail: "evan@example.com",
		invitee: toStoryProfile(STORY_PEOPLE[2]),
		invitedAt: "2026-09-20T12:00:00.000Z",
		joinedAt: null,
	},
	{
		...MODEL_WATCHERS,
		inviteId: "invite-noor",
		inviteeEmail: "noor@example.com",
		invitee: null,
		invitedAt: "2026-09-28T12:00:00.000Z",
		joinedAt: null,
	},
]

// a dozen invitations by email, every third one joined, enough for a second page
const MANY_SENT_TEAM_INVITES: SentTeamInvite[] = Array.from({ length: 12 }, (_, i) => ({
	...MODEL_WATCHERS,
	inviteId: `invite-${i + 1}`,
	inviteeEmail: `invitee${i + 1}@example.com`,
	invitee: null,
	invitedAt: `2026-09-${String(i + 10).padStart(2, "0")}T12:00:00.000Z`,
	joinedAt: i % 3 === 0 ? "2026-09-30T12:00:00.000Z" : null,
}))

const meta = {
	title: "Table/TeamInvitesTable",
	component: SentTeamInvitesTable,
	args: { invites: SENT_TEAM_INVITES, onReload: fn() },
	argTypes: {
		invites: { control: "object", table: { type: { summary: 'TeamsPageResponse["sentInvites"]' } } },
		onReload: { control: false, table: { type: { summary: "() => void" } } },
	},
	parameters: {
		session: "user",
		// react-docgen reads the invites prop as an array with no element type, which throws in storybook's args table,
		// so the table takes its types from the argTypes above
		docs: { extractArgTypes: () => null },
	},
	// withdrawing an invitation resolves without a request
	beforeEach: () => {
		mocked(sendDeleteTeamInvite).mockResolvedValue(undefined)
	},
} satisfies Meta<typeof SentTeamInvitesTable>

export default meta
type Story = StoryObj<typeof meta>

// a joined invitation and two waiting ones, newest first
export const Default: Story = {}

// a dozen invitations, paged ten at a time
export const ManyInvites: Story = { args: { invites: MANY_SENT_TEAM_INVITES } }

// the confirmation that opens when an invitation's switch is turned off
export const WithdrawConfirmation: Story = {
	play: async ({ canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole("switch", { name: "Withdraw the invitation to noor@example.com" }))
	},
}
