import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { PageSkeleton, TableSkeleton } from "./PageSkeleton"

// compare each initial loading layout in the same theme and viewport as its page
const meta = {
	title: "Layout/PageSkeleton",
	component: PageSkeleton,
	args: { kind: "profile" },
} satisfies Meta<typeof PageSkeleton>
export default meta
type Story = StoryObj<typeof meta>
export const Profile: Story = {}
export const Teams: Story = { args: { kind: "teams" } }
export const Activity: Story = { args: { kind: "activity" } }
export const Account: Story = { args: { kind: "account" } }
export const Team: Story = { args: { kind: "team" } }
export const TopicsLoading: Story = { render: () => <TableSkeleton /> }
