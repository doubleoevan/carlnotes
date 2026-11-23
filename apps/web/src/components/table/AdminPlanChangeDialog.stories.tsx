// the admin users table's admin plan change dialog: a paid plan with its reason and end date, and the free plan that
// ends an admin plan change
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { fn } from "storybook/test"
import { AdminPlanChangeDialog } from "./AdminPlanChangeDialog"

const meta = {
	title: "Table/AdminPlanChangeDialog",
	component: AdminPlanChangeDialog,
	args: { username: "vienna", plan: "premium", onSave: fn(async () => {}), onClose: fn() },
	parameters: { session: "admin" },
} satisfies Meta<typeof AdminPlanChangeDialog>

export default meta
type Story = StoryObj<typeof meta>

// an admin plan change to premium, asking for the reason and an optional end date
export const Default: Story = {}

// the free plan ends an admin plan change, so the dialog asks for the reason alone
export const ReturnToFree: Story = { args: { plan: "free" } }

// an admin plan change being edited starts from its reason and end date
export const EditAdminPlanChange: Story = {
	args: { adminPlanChange: { reason: "Beta tester", endsAt: "2027-01-31T23:59:59.000Z" } },
}
