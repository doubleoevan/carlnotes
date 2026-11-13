import { PODCAST_NAME } from "@carlnotes/contracts/podcastEpisodes"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { expect, userEvent, waitFor, within } from "storybook/test"
import { CollapsibleSection } from "@/components/topic/CollapsibleSection"
import { PodcastThemeSongNote } from "./PodcastThemeSongNote"

const meta: Meta<typeof PodcastThemeSongNote> = {
	title: "Podcast/PodcastThemeSongNote",
	component: PodcastThemeSongNote,
}
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}

// the tile right after a section's title, where the film section and the podcast section show it. a press on the
// tile opens the credits and leaves the section open, and a press on the title still closes the section
export const BesideSectionTitle: Story = {
	render: () => (
		<CollapsibleSection
			value="podcast"
			title={PODCAST_NAME}
			titleNote={<PodcastThemeSongNote />}
			countLabel="6 episodes"
			className="max-w-3xl"
		>
			<p className="text-sm">The podcast player card.</p>
		</CollapsibleSection>
	),
	play: async ({ canvas, canvasElement }) => {
		// open the credits from the tile. the section stays open
		const page = within(canvasElement.ownerDocument.body)
		const sectionToggle = canvas.getByRole("button", { name: PODCAST_NAME })
		await userEvent.click(canvas.getByRole("button", { name: "Theme song credits" }))
		await waitFor(() => expect(page.getByRole("dialog")).toBeVisible())
		await expect(sectionToggle).toHaveAttribute("aria-expanded", "true")

		// close the credits, then close the section from its title
		await userEvent.keyboard("{Escape}")
		await userEvent.click(sectionToggle)
		await expect(sectionToggle).toHaveAttribute("aria-expanded", "false")
	},
}
