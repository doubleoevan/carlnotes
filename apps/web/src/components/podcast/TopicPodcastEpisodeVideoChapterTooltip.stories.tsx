import { fetchTopicFindingLinkPreview } from "@carlnotes/client/topicFindingClient"
import { PODCAST_STORY_FILM_EPISODE, PODCAST_STORY_LONG_TITLE_EPISODE } from "@carlnotes/core/lib/podcastEpisodeStories"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { expect, mocked, waitFor } from "storybook/test"
import { TopicPodcastEpisodeVideoChapterTooltip } from "./TopicPodcastEpisodeVideoChapterTooltip"

// the first chapter of the stories' film, and one with a title long enough to wrap past two lines
const [chapter] = PODCAST_STORY_FILM_EPISODE.chapters
const [longTitleChapter] = PODCAST_STORY_LONG_TITLE_EPISODE.chapters

// the tooltip's frame in the open tooltip, which holds the chapter's image
const IMAGE_FRAME_SELECTOR = '[data-slot="tooltip-content"] .aspect-video'

const meta: Meta<typeof TopicPodcastEpisodeVideoChapterTooltip> = {
	title: "Podcast/TopicPodcastEpisodeVideoChapterTooltip",
	component: TopicPodcastEpisodeVideoChapterTooltip,
	args: {
		podcastEpisodeId: PODCAST_STORY_FILM_EPISODE.id,
		chapter,
		chapterSegmentBox: { left: 0, top: 0, width: 160, height: 6 },
	},
	decorators: [
		(Story) => (
			// one segment of a seek bar, with room above it for the tooltip
			<div className="relative mx-auto mt-64 h-1.5 w-40 rounded-full bg-muted">
				<Story />
			</div>
		),
	],
}
export default meta
type Story = StoryObj<typeof meta>

// a chapter whose Finding has a link preview image, which the film shows first
export const LinkPreviewImage: Story = {
	beforeEach: () => {
		mocked(fetchTopicFindingLinkPreview).mockResolvedValue({
			url: chapter?.sourceUrl ?? "",
			title: chapter?.title ?? null,
			description: null,
			imagePath: "/topic-tutorial-video-thumbnail.webp",
			faviconPath: null,
			youtubeVideoId: null,
		})
	},
}

// a chapter with no link preview image and no imagined image, which falls back to the podcast card's band
export const PodcastCard: Story = {
	play: async () => {
		await waitFor(() =>
			expect(document.querySelector<HTMLImageElement>(`${IMAGE_FRAME_SELECTOR} img`)?.src).toContain(
				"/podcast-cover-placeholder.jpg",
			),
		)
	},
}

// a title that wraps to two lines and no further
export const LongTitle: Story = { args: { chapter: longTitleChapter } }

// a chapter whose every image fails to load, which shows its title alone
export const NoImage: Story = {
	play: async () => {
		await waitFor(async () => {
			// fail the image the tooltip tries now, until no image is left and the frame goes away
			document.querySelector(`${IMAGE_FRAME_SELECTOR} img`)?.dispatchEvent(new Event("error"))
			await expect(document.querySelector(IMAGE_FRAME_SELECTOR)).toBeNull()
		})
	},
}
