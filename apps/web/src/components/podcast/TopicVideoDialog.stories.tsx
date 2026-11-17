import { fetchPodcastEpisode } from "@carlnotes/client/podcastEpisodeClient"
import { PODCAST_STORY_FILM_EPISODE, PodcastEpisodeStory } from "@carlnotes/core/lib/podcastEpisodeStories"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { expect, fn, mocked, waitFor, within } from "storybook/test"
import { TopicVideoDialog } from "./TopicVideoDialog"

const meta = {
	title: "Podcast/TopicVideoDialog",
	component: TopicVideoDialog,
	args: {
		podcastEpisodeId: PODCAST_STORY_FILM_EPISODE.id,
		title: PODCAST_STORY_FILM_EPISODE.title ?? "",
		onClose: fn(),
	},
	parameters: { webReference: "apps/web/src/components/podcast/TopicVideoDialog.tsx at 375px" },
	decorators: [
		(Story) => (
			<PodcastEpisodeStory episode={PODCAST_STORY_FILM_EPISODE}>
				<Story />
			</PodcastEpisodeStory>
		),
	],
} satisfies Meta<typeof TopicVideoDialog>
export default meta
type Story = StoryObj<typeof meta>

// the dialog on the film's poster, which waits for a press
export const Poster: Story = {
	beforeEach: () => {
		mocked(fetchPodcastEpisode).mockResolvedValue(PODCAST_STORY_FILM_EPISODE)
	},
}

// open the source inside the film dialog and restore focus to Seek on Escape
export const KeyboardChapterSource: Story = {
	beforeEach: Poster.beforeEach,
	play: async ({ userEvent }) => {
		// open the current chapter from the seek bar and follow focus to the source link
		const film = within(document.body)
		const seekInput = await film.findByRole("slider", { name: "Seek" })
		seekInput.focus()
		await userEvent.keyboard("{Enter}")
		const chapterPreview = await film.findByRole("dialog", { name: "Chapter source" })
		const sourceLink = within(chapterPreview).getByRole("link", { name: /opens in a new tab/ })
		await waitFor(() => expect(sourceLink).toHaveFocus())

		// dismiss the preview while the film dialog stays open and Seek regains focus
		await userEvent.keyboard("{Escape}")
		await waitFor(() => expect(chapterPreview).not.toBeInTheDocument())
		await expect(seekInput).toHaveFocus()
	},
}

// the dialog while the podcast episode loads
export const Loading: Story = {
	beforeEach: () => {
		mocked(fetchPodcastEpisode).mockReturnValue(new Promise(() => {}))
	},
}

// the dialog if the podcast episode fails to load
export const Failed: Story = {
	beforeEach: () => {
		mocked(fetchPodcastEpisode).mockResolvedValue(null)
	},
}
