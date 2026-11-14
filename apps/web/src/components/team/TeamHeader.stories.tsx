import { toTestTeamPage } from "@carlnotes/contracts/teamTestFixtures"
import { UNCHECKED_AVATAR_TEXT } from "@carlnotes/core/lib/uncheckedImageCopy"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { expect, fn } from "storybook/test"
import { NewTopicButton } from "@/components/topic/TopicEditorChoiceDialog"
import { TeamHeader } from "./TeamHeader"

// a member's header with the counts and the description, a visitor's with Join, a leader's with the avatar picker,
// and a leader's with the line under an avatar shown to them alone
const meta = {
	title: "Team/TeamHeader",
	component: TeamHeader,
	args: {
		teamPage: toTestTeamPage(),
		noteCount: 3,
		isSignedIn: true,
		onChanged: fn(),
		onInviteOpen: fn(),
		onOpenChat: fn(),
		topicButton: <NewTopicButton onNewTopic={fn()} />,
	},
} satisfies Meta<typeof TeamHeader>
export default meta
type Story = StoryObj<typeof meta>
export const Member: Story = {}
export const Visitor: Story = { args: { teamPage: toTestTeamPage({ role: null }), isSignedIn: false } }
export const Leader: Story = { args: { teamPage: toTestTeamPage({ role: "leader" }) } }

// the leader who uploaded an unchecked avatar sees it in the team's avatar's place, with its line wrapped under it
export const LeaderWithUncheckedAvatar: Story = {
	args: { teamPage: toTestTeamPage({ role: "leader", uncheckedAvatarVersion: "unchecked-version" }) },
	play: async ({ canvas }) => {
		// the line is no wider than the avatar, so the title stays beside the avatar
		const uncheckedLine = canvas.getByText(UNCHECKED_AVATAR_TEXT)
		await expect(uncheckedLine).toBeVisible()
		const avatarBox = canvas.getByLabelText("Change the team avatar").getBoundingClientRect()
		const uncheckedLineBox = uncheckedLine.getBoundingClientRect()
		await expect(uncheckedLineBox.top).toBeGreaterThanOrEqual(avatarBox.bottom)
		await expect(Math.round(uncheckedLineBox.width)).toBeLessThanOrEqual(Math.round(avatarBox.width))
	},
}
