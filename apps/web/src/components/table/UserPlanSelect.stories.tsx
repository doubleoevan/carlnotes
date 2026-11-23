// a user row's plan select in the admin users table: a plan with no admin plan change, and a plan an admin set with its
// badge
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { fn } from "storybook/test"
import { OVER_BUDGET_USER_ROW, PLUS_USER_ROW } from "../../../.storybook/fixtures/adminUsers"
import { UserPlanSelect } from "./UserPlanSelect"

const meta = {
	title: "Table/UserPlanSelect",
	component: UserPlanSelect,
	args: { user: OVER_BUDGET_USER_ROW, onPlanPick: fn(), onAdminPlanChangeEdit: fn() },
	parameters: { session: "admin" },
} satisfies Meta<typeof UserPlanSelect>

export default meta
type Story = StoryObj<typeof meta>

// a plan with no admin plan change shows the select alone
export const Default: Story = {}

// a plan an admin set shows its Set by admin badge and end date, with the reason in the tooltip
export const SetByAdmin: Story = { args: { user: PLUS_USER_ROW } }
