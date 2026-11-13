import { toTestTeamPage } from "@carlnotes/contracts/teamTestFixtures"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { fn } from "storybook/test"
import { NewTopicButton } from "@/components/topic/TopicEditorChoiceDialog"
import { TeamHeader } from "./TeamHeader"

// a member's header with the counts and the description, a visitor's with Join, and a leader's with the avatar picker
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
