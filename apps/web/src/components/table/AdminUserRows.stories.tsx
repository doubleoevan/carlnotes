// the admin users table's row: the user's links, role select, topics and teams subtables, spend, and budget override
import { fetchAdminUserTeams, fetchAdminUserTopics } from "@carlnotes/client/billingClient"
import type { OwnerTopic } from "@carlnotes/contracts/activity"
import type { TeamSummary } from "@carlnotes/contracts/teams"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { expect, fn, mocked } from "storybook/test"
import { STORY_ADMIN } from "../../../.storybook/fixtures"
import {
	ADMIN_USER_ROW_FIXTURES,
	BUDGET_OVERRIDE_USER_ROW,
	OVER_BUDGET_USER_ROW,
	PLUS_USER_ROW,
	SIGNED_IN_ADMIN_ROW,
} from "../../../.storybook/fixtures/adminUsers"
import { STORY_TEAMS } from "../../../.storybook/fixtures/teams"
import { OWNER_TOPIC_FIXTURES } from "../../../.storybook/fixtures/topics"
import { findVisibleByRole } from "../../../.storybook/play"
import { StoryTable } from "../../../.storybook/tableDecorators"
import { UserRow } from "./AdminUserRows"
import { AdminUsersTableHead } from "./AdminUsersTable"
import type { RowSort } from "./SortableHeader"

// the users table's starting sort, by no column. a header click changes nothing in a story about one row
const NO_COLUMN_SORT: RowSort = { sortKey: null, isDescending: false, toggleSort: () => {} }

// the team the plus user leads, which the row's teams subtable lists
const PLUS_USER_TEAM_FIXTURES: TeamSummary[] = [
	{
		...STORY_TEAMS.readingGroup,
		isPublic: true,
		memberCount: 3,
		topicCount: 2,
		scanSpendCents: 640,
		chatSpendCents: 120,
		role: "leader",
		isOnlyLeader: true,
		invitedBy: null,
		chatMentions: [],
	},
]

const meta = {
	title: "Table/UserRow",
	component: UserRow,
	args: { user: PLUS_USER_ROW, signedInUserId: STORY_ADMIN.userId, onReloadPage: fn() },
	argTypes: {
		signedInUserId: { control: "select", options: ADMIN_USER_ROW_FIXTURES.map((user) => user.id) },
		onReloadPage: { control: false },
	},
	parameters: { session: "admin" },
	// the row's subtables load the user's teams and topics from the mocked billing client
	beforeEach: () => {
		mocked(fetchAdminUserTeams).mockResolvedValue(PLUS_USER_TEAM_FIXTURES)
		mocked(fetchAdminUserTopics).mockResolvedValue(OWNER_TOPIC_FIXTURES)
	},
	// the row renders in the users table's body, under its column headers and at its width
	decorators: [
		(Story) => (
			<StoryTable
				className="min-w-3xl [&_tbody_tr:last-child>*]:border-b-0"
				head={<AdminUsersTableHead sort={NO_COLUMN_SORT} />}
			>
				<Story />
			</StoryTable>
		),
	],
} satisfies Meta<typeof UserRow>

export default meta
type Story = StoryObj<typeof meta>

// another user's row: the role select, the counts that open subtables, and the close account button
export const Default: Story = {}

// the signed-in admin's own row, whose role select is disabled and which has no close account button
export const OwnRow: Story = { args: { user: SIGNED_IN_ADMIN_ROW } }

// a user past their monthly budget, whose cost shows in the destructive color, with no login date yet
export const OverBudget: Story = {
	args: { user: OVER_BUDGET_USER_ROW },
}

// a budget override in its input, disabled counts at zero, and a dash for a cost the proxy could not report
export const BudgetOverride: Story = { args: { user: BUDGET_OVERRIDE_USER_ROW } }

// the user's teams subtable, opened by a click on the team count
export const TeamsOpen: Story = {
	play: async ({ canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole("button", { name: /^Show vienna's teams, \d+$/ }))
		await expect(await canvas.findByRole("link", { name: /Reading Group/ })).toBeVisible()
	},
}

// the user's topics subtable, opened by a click on the topic count
export const TopicsOpen: Story = {
	play: async ({ canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole("button", { name: /^Show vienna's topics, \d+$/ }))
		await expect(await canvas.findByRole("link", { name: "LLM tooling" })).toBeVisible()
	},
}

// the loading state a subtable shows while the user's topics load
export const TopicsLoading: Story = {
	beforeEach: () => {
		mocked(fetchAdminUserTopics).mockReturnValue(new Promise<OwnerTopic[]>(() => {}))
	},
	play: async ({ canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole("button", { name: /^Show vienna's topics, \d+$/ }))
	},
}

// the confirmation a click on the close account button opens
export const ConfirmClose: Story = {
	play: async ({ canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole("button", { name: "Close vienna's account" }))
		// the dialog fades in, so wait for it to show
		await findVisibleByRole("dialog")
	},
}
