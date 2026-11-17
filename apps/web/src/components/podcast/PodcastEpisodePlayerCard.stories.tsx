import {
	PODCAST_STORY_EPISODE,
	PODCAST_STORY_FEED,
	PODCAST_STORY_FILM_EPISODE,
	PODCAST_STORY_LONG_TITLE_EPISODE,
	PodcastEpisodeStory,
} from "@carlnotes/core/lib/podcastEpisodeStories"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { expect, within } from "storybook/test"
import { PodcastEpisodePlayerCard } from "./PodcastEpisodePlayerCard"

const meta: Meta<typeof PodcastEpisodePlayerCard> = {
	title: "Podcast/PodcastEpisodePlayerCard",
	component: PodcastEpisodePlayerCard,
	args: {
		podcastEpisode: PODCAST_STORY_EPISODE,
		chapterTopicFeed: PODCAST_STORY_FEED,
		onOpenPodcastFeedDialog: () => {},
	},
	parameters: { webReference: "apps/web/src/components/podcast/PodcastEpisodePlayerCard.tsx at 375px" },
	decorators: [
		(Story, context) => (
			<PodcastEpisodeStory episode={context.args.podcastEpisode} state={context.parameters.playbackState ?? "unloaded"}>
				<div className="flex flex-col gap-3">
					<Story />
				</div>
			</PodcastEpisodeStory>
		),
	],
}
export default meta
type Story = StoryObj<typeof meta>
export const Unloaded: Story = {}
export const Playing: Story = { parameters: { playbackState: "playing" } }
export const Paused: Story = { parameters: { playbackState: "paused" } }
export const Buffering: Story = { parameters: { playbackState: "buffering" } }
export const PlaybackError: Story = { parameters: { playbackState: "error" } }
export const LongTitle: Story = { args: { podcastEpisode: PODCAST_STORY_LONG_TITLE_EPISODE } }

// hover the audio seek bar and move into the chapter's source preview
export const ChapterSourcePreview: Story = {
	play: async ({ canvas, canvasElement, userEvent }) => {
		// move over the first segment through the range input that covers it
		const seekInput = canvas.getByRole("slider", { name: "Seek" })
		const chapterSegment = canvasElement.querySelector("[data-chapter-segment]")
		if (!chapterSegment) {
			throw new Error("Expected a chapter segment")
		}
		const chapterSegmentBounds = chapterSegment.getBoundingClientRect()
		await userEvent.pointer({ target: seekInput, coords: { clientX: chapterSegmentBounds.x + 1 } })

		// enter the portalled preview and check that its title links to the chapter's source
		const preview = await within(document.body).findByRole("dialog", { name: "Chapter source" })
		const sourceLink = within(preview).getByRole("link", { name: /Coffee chapter 1.*opens in a new tab/ })
		await userEvent.pointer({ target: sourceLink })
		await expect(sourceLink).toBeVisible()
		await expect(sourceLink).toHaveAttribute("target", "_blank")
	},
}

// a podcast episode with a film, whose card has no button for the film and no theme song credits
export const WithFilm: Story = {
	args: { podcastEpisode: PODCAST_STORY_FILM_EPISODE },
	play: async ({ canvas }) => {
		await expect(canvas.queryByRole("button", { name: "Watch" })).toBeNull()
		await expect(canvas.queryByRole("button", { name: "Theme song credits" })).toBeNull()
	},
}

export const MissingFinding: Story = {
	args: {
		podcastEpisode: {
			...PODCAST_STORY_EPISODE,
			chapters: PODCAST_STORY_EPISODE.chapters.map((chapter) => ({ ...chapter, findingId: null, rating: "up" })),
		},
	},
}
export const Expanded: Story = {
	parameters: { playbackState: "paused" },
	play: async ({ canvasElement }) => {
		const button = canvasElement.querySelector<HTMLButtonElement>('button[aria-expanded="false"]')
		button?.click()
	},
}
