// the profile link's loading state: the avatar and the username as placeholders on the link's own line
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { UserProfileLinkSkeleton } from "./UserProfileLinkSkeleton"

const meta = {
	title: "Common/UserProfileLinkSkeleton",
	component: UserProfileLinkSkeleton,
	args: { className: "text-sm" },
} satisfies Meta<typeof UserProfileLinkSkeleton>

export default meta
type Story = StoryObj<typeof meta>

// the link's line under a page's title, as the Account and Activity pages show it for an admin
export const Default: Story = {}
