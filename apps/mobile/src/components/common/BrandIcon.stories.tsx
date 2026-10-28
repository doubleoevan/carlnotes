import type { Meta, StoryObj } from "@storybook/react-native"
import { YoutubePlayIcon } from "./BrandIcon"

// the tutorial, header, and menu use the same branded play mark
const meta = {
	title: "Common/BrandIcon",
	component: YoutubePlayIcon,
	parameters: { webReference: "common-brandicon--youtube-play" },
	args: { size: 32 },
} satisfies Meta<typeof YoutubePlayIcon>
export default meta
type Story = StoryObj<typeof meta>
export const YoutubePlay: Story = {}
