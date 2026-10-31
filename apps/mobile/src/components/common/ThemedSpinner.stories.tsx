import type { Meta, StoryObj } from "@storybook/react-native"
import { ThemedSpinner } from "./ThemedSpinner"

// the spinner colors of the mic, a reply's play button, and the podcast question button
const meta = {
	title: "Common/ThemedSpinner",
	component: ThemedSpinner,
	parameters: { webReference: "apps/web/src/components/chat/MicButton.tsx" },
	args: { color: "primaryForeground" },
} satisfies Meta<typeof ThemedSpinner>
export default meta
type Story = StoryObj<typeof meta>
// the spinner color of each icon button
export const Mic: Story = {}
export const PlayButton: Story = { args: { color: "mutedForeground" } }
export const PodcastEpisodeQuestion: Story = { args: { color: "foreground" } }
