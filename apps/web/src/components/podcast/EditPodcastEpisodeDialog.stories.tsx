// the Edit podcast dialog: the title, the description, and the image block, then Cancel and Save
import { sendPodcastEpisodeUpdate } from "@carlnotes/client/podcastEpisodeClient"
import { PODCAST_STORY_EDITOR_PAGE } from "@carlnotes/core/lib/podcastEpisodeStories"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { expect, fn, mocked, userEvent, within } from "storybook/test"
import { EditPodcastEpisodeDialog } from "./EditPodcastEpisodeDialog"

const meta = {
	title: "Podcast/EditPodcastEpisodeDialog",
	component: EditPodcastEpisodeDialog,
	args: { podcastEpisodePage: PODCAST_STORY_EDITOR_PAGE, onPodcastEpisodeChanged: fn(), onClose: fn() },
} satisfies Meta<typeof EditPodcastEpisodeDialog>

export default meta
type Story = StoryObj<typeof meta>

// Save sends the edited title and the description, then reloads the page and closes
export const Default: Story = {
	beforeEach: () => {
		mocked(sendPodcastEpisodeUpdate).mockResolvedValue()
	},
	play: async ({ canvasElement, args }) => {
		// the dialog renders in a portal, so its fields are read from the document
		const dialog = within(canvasElement.ownerDocument.body)
		const titleInput = dialog.getByLabelText(/Title/)
		await expect(titleInput).toHaveValue("Better beans, better mornings")
		await userEvent.clear(titleInput)
		await userEvent.type(titleInput, "Fresher beans")
		await userEvent.click(dialog.getByRole("button", { name: "Save" }))
		await expect(mocked(sendPodcastEpisodeUpdate)).toHaveBeenCalledWith(PODCAST_STORY_EDITOR_PAGE.podcastEpisode.id, {
			title: "Fresher beans",
			description: "Why fresher beans and a finer grind make the morning cup sweeter.",
		})
		await expect(args.onPodcastEpisodeChanged).toHaveBeenCalled()
		await expect(args.onClose).toHaveBeenCalled()
	},
}

// an empty title is not sent, and its field is marked
export const TitleMissing: Story = {
	play: async ({ canvasElement }) => {
		const dialog = within(canvasElement.ownerDocument.body)
		await userEvent.clear(dialog.getByLabelText(/Title/))
		await userEvent.click(dialog.getByRole("button", { name: "Save" }))
		await expect(mocked(sendPodcastEpisodeUpdate)).not.toHaveBeenCalled()
	},
}
