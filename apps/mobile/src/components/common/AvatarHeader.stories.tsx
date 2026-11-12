// the avatar header with the app's elements and the web stories' names: a person's or team's avatar beside their name,
// with the Dashboard's summary counts or no details line, and the placeholder that holds their place while they load
import { AvatarHeader, AvatarHeaderSkeleton } from "@carlnotes/core/components/AvatarHeader"
import { DashboardSubjectHeader } from "@carlnotes/core/components/DashboardSubjectHeader"
import { STORY_TEAM_DASHBOARD_HEADER, STORY_TOPIC_DASHBOARD } from "@carlnotes/core/lib/dashboardStories"
import type { Meta, StoryObj } from "@storybook/react-native"
import { View } from "react-native"
import { MOBILE_AVATAR_HEADER_ELEMENTS, MOBILE_AVATAR_HEADER_SKELETON_ELEMENTS } from "./avatarHeaderElements"
import { DetailsLine } from "./DetailsLine"

// the avatar header with the summary strip's details line, as a Dashboard screen shows it
const SUBJECT_HEADER_ELEMENTS = { ...MOBILE_AVATAR_HEADER_ELEMENTS, DetailsLine }

const meta: Meta<typeof AvatarHeader> = {
	title: "Common/AvatarHeader",
	component: AvatarHeader,
	parameters: { webReference: "apps/web/src/components/common/AvatarHeader.stories.tsx at 375px" },
	args: { subject: STORY_TOPIC_DASHBOARD.subject, elements: MOBILE_AVATAR_HEADER_ELEMENTS },
	decorators: [
		(Story) => (
			<View className="w-full px-4">
				<Story />
			</View>
		),
	],
}

export default meta
type Story = StoryObj<typeof meta>

/** A person's avatar beside their name alone, centered on the avatar, as Teams, Activity, and Account show it. */
export const User: Story = {}

/** Topic Dashboard's header with the person's summary counts on the details line. */
export const WithSummary: Story = {
	render: () => (
		<DashboardSubjectHeader
			subject={STORY_TOPIC_DASHBOARD.subject}
			summary={STORY_TOPIC_DASHBOARD.summary}
			elements={SUBJECT_HEADER_ELEMENTS}
		/>
	),
}

/** Team Dashboard's header with the team's avatar, name, and summary counts with its members. */
export const Team: Story = {
	render: () => <DashboardSubjectHeader {...STORY_TEAM_DASHBOARD_HEADER} elements={SUBJECT_HEADER_ELEMENTS} />,
}

/** The header while a person loads: the avatar's circle and the name's bar, centered on the avatar. */
export const Loading: Story = {
	render: () => <AvatarHeaderSkeleton elements={MOBILE_AVATAR_HEADER_SKELETON_ELEMENTS} />,
}

/** A Dashboard's header while it loads: the avatar's circle, the name's bar, and the summary counts' bar. */
export const LoadingWithSummary: Story = {
	render: () => <AvatarHeaderSkeleton hasDetails elements={MOBILE_AVATAR_HEADER_SKELETON_ELEMENTS} />,
}

/** Team Dashboard's header while it loads for a member: the avatar's circle and the team dropdown's shape. */
export const LoadingWithTeamDropdown: Story = {
	render: () => <AvatarHeaderSkeleton hasDetails hasTeamDropdown elements={MOBILE_AVATAR_HEADER_SKELETON_ELEMENTS} />,
}
