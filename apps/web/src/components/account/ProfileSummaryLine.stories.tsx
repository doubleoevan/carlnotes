// the line under a profile's name, with and without the user block
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { expect } from "storybook/test"
import { FIXTURE_DATE } from "../../../.storybook/fixtures"
import { ProfileSummaryLine } from "./ProfileSummaryLine"

const meta = {
	title: "Account/ProfileSummaryLine",
	component: ProfileSummaryLine,
	args: { profile: { joinedAt: FIXTURE_DATE.toISOString(), subscriberCount: 20, isBlocked: false } },
} satisfies Meta<typeof ProfileSummaryLine>

export default meta
type Story = StoryObj<typeof meta>

// a profile the user has not blocked
export const Default: Story = {}

// a profile the user blocked links to the account page's list
export const Blocked: Story = {
	args: { profile: { joinedAt: FIXTURE_DATE.toISOString(), subscriberCount: 20, isBlocked: true } },
	play: async ({ canvas }) => {
		await expect(canvas.getByRole("link", { name: "Blocked" })).toHaveAttribute("href", "/account#blocked-people")
	},
}
