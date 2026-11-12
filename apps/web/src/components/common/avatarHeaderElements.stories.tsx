// the avatar header with the web's elements: a person's avatar beside their name alone, as Teams, Activity, and Account
// show it under their headings, and its placeholder. Dashboard/DashboardHeader shows it with the summary counts
import { AvatarHeader, AvatarHeaderSkeleton } from "@carlnotes/core/components/AvatarHeader"
import { STORY_TOPIC_DASHBOARD } from "@carlnotes/core/lib/dashboardStories"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { WEB_AVATAR_HEADER_ELEMENTS, WEB_AVATAR_HEADER_SKELETON_ELEMENTS } from "./avatarHeaderElements"

const meta = {
	title: "Common/AvatarHeader",
	component: AvatarHeader,
	parameters: { surface: "page" },
	args: { subject: STORY_TOPIC_DASHBOARD.subject, elements: WEB_AVATAR_HEADER_ELEMENTS },
} satisfies Meta<typeof AvatarHeader>

export default meta
type Story = StoryObj<typeof meta>

/** A person's avatar beside their name alone, centered on the avatar. */
export const User: Story = {}

/** The header while a person loads: the avatar's circle and the name's bar, centered on the avatar. */
export const Loading: Story = {
	render: () => <AvatarHeaderSkeleton elements={WEB_AVATAR_HEADER_SKELETON_ELEMENTS} />,
}
