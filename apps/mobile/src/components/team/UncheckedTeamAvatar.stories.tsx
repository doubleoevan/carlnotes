import type { Meta, StoryObj } from "@storybook/react-native"
import { UncheckedTeamAvatar } from "./UncheckedTeamAvatar"

// the avatar shown to a leader alone as the Edit team sheet shows it above its image button, with the photo line
// under it. the web modal shows the same upload and line in its avatar picker
const meta: Meta<typeof UncheckedTeamAvatar> = {
	title: "Team/UncheckedTeamAvatar",
	component: UncheckedTeamAvatar,
	parameters: { webReference: "apps/web/src/components/avatar/TeamAvatarPicker.tsx in the Edit team modal at 375px" },
	args: {
		team: {
			teamId: "story-team",
			name: "Coffee Club",
			avatarVersion: null,
			description: null,
			isPublic: true,
			uncheckedAvatarVersion: "unchecked-version",
		},
		name: "Coffee Club",
		isImagePicked: false,
	},
}
export default meta
type Story = StoryObj<typeof meta>
export const UncheckedPhoto: Story = {}
