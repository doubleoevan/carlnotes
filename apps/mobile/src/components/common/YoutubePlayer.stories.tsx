import { TOPIC_TUTORIAL_VIDEO } from "@carlnotes/contracts/youtube"
import type { Meta, StoryObj } from "@storybook/react-native"
import { View } from "react-native"
import { YoutubePlayer } from "./YoutubePlayer"

// the same public tutorial exercises the preview and inline playback
const meta: Meta<typeof YoutubePlayer> = {
	title: "Common/YoutubePlayer",
	component: YoutubePlayer,
	parameters: { webReference: "common-youtubeplayer" },
	decorators: [
		(Story) => (
			<View className="w-full overflow-hidden rounded-xl">
				<Story />
			</View>
		),
	],
	args: {
		youtubeVideoId: TOPIC_TUTORIAL_VIDEO.youtubeVideoId,
		title: TOPIC_TUTORIAL_VIDEO.name,
		thumbnailPath: TOPIC_TUTORIAL_VIDEO.thumbnailPath,
	},
}
export default meta
type Story = StoryObj<typeof meta>

// playback starts only after pressing the preview
export const Default: Story = {}
export const WithoutThumbnail: Story = { args: { thumbnailPath: null } }
export const UnavailableVideo: Story = { args: { youtubeVideoId: "unavailable" } }
