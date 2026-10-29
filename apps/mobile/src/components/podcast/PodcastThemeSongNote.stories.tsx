import type { Meta, StoryObj } from "@storybook/react-native"

import { PodcastThemeSongNote } from "./PodcastThemeSongNote"

const meta: Meta<typeof PodcastThemeSongNote> = {
	title: "Podcast/PodcastThemeSongNote",
	component: PodcastThemeSongNote,
}
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
