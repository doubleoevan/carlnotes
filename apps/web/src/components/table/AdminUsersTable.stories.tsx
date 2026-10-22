// the admin console's users table: sortable columns, a row per user with inline edits, and the totals line
import type { AdminUserRow } from "@carlnotes/contracts/admin"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { fn } from "storybook/test"
import { STORY_ADMIN, toStoryEmail } from "../../../.storybook/fixtures"
import { ADMIN_USER_ROW_FIXTURES, SIGNED_IN_ADMIN_ROW } from "../../../.storybook/fixtures/adminUsers"
import { AdminUsersTable } from "./AdminUsersTable"

// the fixture users three times over, enough for two pages. the first copy keeps the signed-in admin's own row, and
// each later copy gets its own id, username, and address
const MANY_ADMIN_USER_ROWS: AdminUserRow[] = [1, 2, 3].flatMap((copyNumber) =>
	ADMIN_USER_ROW_FIXTURES.map((user) => {
		if (copyNumber === 1) {
			return user
		}
		const username = `${user.username}${copyNumber}`
		return { ...user, id: `${user.id}-${copyNumber}`, username, email: toStoryEmail(username) }
	}),
)

const meta = {
	title: "Table/AdminUsersTable",
	component: AdminUsersTable,
	args: { users: ADMIN_USER_ROW_FIXTURES, signedInUserId: STORY_ADMIN.userId, onReload: fn() },
	argTypes: {
		signedInUserId: { control: "select", options: ADMIN_USER_ROW_FIXTURES.map((user) => user.id) },
		onReload: { control: false },
	},
	parameters: { session: "admin" },
} satisfies Meta<typeof AdminUsersTable>

export default meta
type Story = StoryObj<typeof meta>

// four users: the signed-in admin, a plus user, a user over budget, and a user with a budget override
export const Default: Story = {}

// twelve users, more than a page holds, with the rows select and the pager under the table
export const ManyUsers: Story = { args: { users: MANY_ADMIN_USER_ROWS } }

// the smallest console, whose only user is the signed-in admin
export const OneUser: Story = { args: { users: [SIGNED_IN_ADMIN_ROW] } }
