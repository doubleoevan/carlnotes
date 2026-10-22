// the round avatar of a user or a team: the stored image, or the initials on a tinted circle
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { STORY_USER } from "../../../.storybook/fixtures"
import { Avatar } from "./Avatar"

const meta = {
	title: "Branding/Avatar",
	component: Avatar,
	// a user's avatar as the profile page header draws it, at size-16, with the initials of the username
	args: { imageUrl: null, ownerId: STORY_USER.userId, name: STORY_USER.username, className: "size-16" },
	argTypes: {
		imageUrl: { control: "text" },
		ownerId: { control: "text" },
		name: { control: "text" },
		className: { control: "text" },
	},
} satisfies Meta<typeof Avatar>

export default meta
type Story = StoryObj<typeof meta>

// no stored image, so the username's initial on the tint that the owner id picks
export const Initials: Story = {}

// a team's avatar at the size-6 that tables and search results draw, with the two initials of the team name
export const TeamInitials: Story = { args: { ownerId: "team-river", name: "River Lab", className: "size-6" } }

// a stored image, loaded from the app's own root path
export const Image: Story = { args: { imageUrl: "/social-avatar-400.png" } }

// an image url that fails to load, which falls back to the initials
export const BrokenImage: Story = { args: { imageUrl: "/missing-avatar.png" } }
