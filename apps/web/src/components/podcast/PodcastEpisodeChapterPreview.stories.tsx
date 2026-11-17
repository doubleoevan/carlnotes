import { fetchTopicFindingLinkPreview } from "@carlnotes/client/topicFindingClient"
import { PODCAST_STORY_FILM_EPISODE, PODCAST_STORY_LONG_TITLE_EPISODE } from "@carlnotes/core/lib/podcastEpisodeStories"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { useRef } from "react"
import { expect, mocked, waitFor, within } from "storybook/test"
import { PodcastEpisodeChapterPreview } from "./PodcastEpisodeChapterPreview"

// the first chapter of the stories' film, and one with a title long enough to wrap past two lines
const [chapter] = PODCAST_STORY_FILM_EPISODE.chapters
const [longTitleChapter] = PODCAST_STORY_LONG_TITLE_EPISODE.chapters

// the frame that holds the chapter image
const IMAGE_FRAME_SELECTOR = '[aria-label="Chapter source"] .aspect-video'

const meta: Meta<typeof PodcastEpisodeChapterPreview> = {
	title: "Podcast/PodcastEpisodeChapterPreview",
	component: PodcastEpisodeChapterPreview,
	args: {
		podcastEpisodeId: PODCAST_STORY_FILM_EPISODE.id,
		chapter,
		hasVideo: true,
	},
	render: function RenderPreview(args) {
		const chapterSegmentRef = useRef<HTMLDivElement>(null)
		return (
			<div style={{ paddingTop: 250 }}>
				{/* one seek bar segment with space above for the preview */}
				<div ref={chapterSegmentRef} className="bg-muted mx-auto h-1.5 w-40 rounded-full" />
				<PodcastEpisodeChapterPreview {...args} chapterSegmentRef={chapterSegmentRef} />
			</div>
		)
	},
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
			faviconPath: "/favicon-96x96.png",
			youtubeVideoId: null,
		})
	},
	play: async () => {
		// verify the title opens its own source in a new tab and renders the Finding's favicon
		const preview = within(document.body).getByRole("dialog", { name: "Chapter source" })
		const sourceLink = within(preview).getByRole("link", { name: /opens in a new tab/ })
		await expect(sourceLink).toHaveAttribute("href", chapter?.sourceUrl)
		await expect(sourceLink).toHaveAttribute("target", "_blank")
		await waitFor(() => expect(sourceLink.querySelector("img")).toHaveAttribute("src", "/favicon-96x96.png"))
	},
}

// a chapter with no link preview image and no generated image, which falls back to the podcast card's band
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
			// fail the images in order until the frame goes away
			document.querySelector(`${IMAGE_FRAME_SELECTOR} img`)?.dispatchEvent(new Event("error"))
			await expect(document.querySelector(IMAGE_FRAME_SELECTOR)).toBeNull()
		})
	},
}
