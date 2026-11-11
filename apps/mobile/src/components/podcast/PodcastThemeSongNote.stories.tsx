import { PODCAST_NAME } from "@carlnotes/contracts/podcastEpisodes"
import type { Meta, StoryObj } from "@storybook/react-native"
import { Text } from "@/components/primitives/text"
import { CollapsibleSection } from "@/components/topic/CollapsibleSection"
import { PodcastThemeSongNote } from "./PodcastThemeSongNote"

const meta: Meta<typeof PodcastThemeSongNote> = {
	title: "Podcast/PodcastThemeSongNote",
	component: PodcastThemeSongNote,
	parameters: { webReference: "apps/web/src/components/podcast/PodcastThemeSongNote.tsx at 375px" },
}
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}

// the tile right after a section's title, where the film section and the podcast section show it. a press on the
// tile opens the credits and leaves the section open, and a press on the title still closes the section
export const BesideSectionTitle: Story = {
	render: () => (
		<CollapsibleSection title={PODCAST_NAME} titleNote={<PodcastThemeSongNote />} countLabel="6 episodes">
			<Text className="text-sm">The podcast player card.</Text>
		</CollapsibleSection>
	),
}
