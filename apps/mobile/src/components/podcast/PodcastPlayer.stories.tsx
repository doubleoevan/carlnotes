import { PodcastPlayer as SharedPodcastPlayer } from "@carlnotes/core/components/PodcastPlayer"
import { PodcastEpisodeStory } from "@carlnotes/core/lib/podcastEpisodeStories"
import type { Meta, StoryObj } from "@storybook/react-native"
import { podcastPlayerElements } from "./PodcastPlayer"

const meta: Meta<typeof SharedPodcastPlayer> = {
	title: "Podcast/PodcastPlayer",
	component: SharedPodcastPlayer,
	args: { elements: podcastPlayerElements },
	decorators: [
		(Story, context) => (
			<PodcastEpisodeStory state={context.parameters.playbackState ?? "playing"}>
				<Story />
			</PodcastEpisodeStory>
		),
	],
}
export default meta
type Story = StoryObj<typeof meta>
export const Playing: Story = {}
export const Paused: Story = { parameters: { playbackState: "paused" } }
export const Buffering: Story = { parameters: { playbackState: "buffering" } }
