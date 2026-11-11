// the news list: a full week in numbered pages, a Podcast Episode with a film, a quiet hour, a closed list, and a
// profile's rows as another reader
import { fetchNews, fetchProfileNews } from "@carlnotes/client/newsClient"
import { fetchPodcastEpisode } from "@carlnotes/client/podcastEpisodeClient"
import { fetchTopicPost } from "@carlnotes/client/topicPostClient"
import { EMPTY_NEWS_STORY, toNewsStoryPage } from "@carlnotes/core/lib/newsStories"
import { PODCAST_STORY_FILM_EPISODE } from "@carlnotes/core/lib/podcastEpisodeStories"
import { TOPIC_POST_DISCUSSION_STORY } from "@carlnotes/core/lib/topicPostStories"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { expect, mocked, within } from "storybook/test"
import { NewsList } from "./NewsList"

const meta = {
	title: "Social/NewsList",
	component: NewsList,
	args: {
		profileUserId: null,
		userId: "user-evan",
		opener: "Espresso had a loud week, and the burr debate is not over.",
	},
	// the week reads the story's pages, and every other window reads as empty, so no story reaches the api
	beforeEach: () => {
		const toStoryNews = async ({ window, page }: { window: string; page: number }) =>
			window === "week" ? toNewsStoryPage(page) : EMPTY_NEWS_STORY
		mocked(fetchNews).mockImplementation(toStoryNews)
		mocked(fetchProfileNews).mockImplementation((_profileUserId, query) => toStoryNews(query))
		mocked(fetchTopicPost).mockResolvedValue(TOPIC_POST_DISCUSSION_STORY)
	},
	decorators: [
		(Story) => (
			<div className="max-w-xl">
				<Story />
			</div>
		),
	],
} satisfies Meta<typeof NewsList>

export default meta
type Story = StoryObj<typeof meta>

// 32 rows show five to a page under carl's opener, numbered across the pages, with the page buttons under them
export const FullWeek: Story = {
	play: async ({ canvas, userEvent }) => {
		await expect(await canvas.findByText("12 reactions on your hot take")).toBeInTheDocument()
		await expect(canvas.getByRole("button", { name: "Week" })).toHaveAttribute("aria-pressed", "true")
		await expect(canvas.getAllByRole("link")).toHaveLength(5)
		// the Podcast Episode's row plays its episode and holds no Topic note button, and the Topic Post's row opens the
		// post's info popup in the Topic note's place
		await expect(canvas.getAllByRole("button", { name: "Topic details" })).toHaveLength(3)
		await expect(canvas.getAllByRole("button", { name: "About this post" })).toHaveLength(1)
		await userEvent.click(within(canvas.getByRole("navigation")).getByText("2"))
		await expect(await canvas.findByText("Grinders, scales, and the pour")).toBeInTheDocument()
		await expect(canvas.getAllByRole("link")).toHaveLength(5)
	},
}

// a Podcast Episode with a film shows the Video pill beside its play pill, which opens the Video dialog on the film's
// poster
export const WithFilm: Story = {
	beforeEach: () => {
		mocked(fetchNews).mockImplementation(async ({ page }) => toNewsStoryPage(page, PODCAST_STORY_FILM_EPISODE))
		mocked(fetchPodcastEpisode).mockResolvedValue(PODCAST_STORY_FILM_EPISODE)
	},
	play: async ({ canvas, userEvent }) => {
		await userEvent.click(await canvas.findByRole("button", { name: "Video" }))
		await expect(await within(document.body).findByRole("dialog")).toBeInTheDocument()
	},
}

// the hour holds no row, so the list shows its empty line under the picker and no page buttons
export const QuietHour: Story = {
	play: async ({ canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole("button", { name: "Hour" }))
		await expect(await canvas.findByText("A quiet hour. Carl kept the kettle on.")).toBeInTheDocument()
		await expect(canvas.getByRole("button", { name: "Hour" })).toHaveAttribute("aria-pressed", "true")
		await expect(canvas.queryByRole("navigation")).toBeNull()
	},
}

// the heading closes the list to its title and picker, and choosing a window opens it again
export const Closed: Story = {
	play: async ({ canvas, userEvent }) => {
		await canvas.findByText("12 reactions on your hot take")
		await userEvent.click(canvas.getByRole("button", { name: "Brews News" }))
		await expect(canvas.queryByText("12 reactions on your hot take")).toBeNull()
		await userEvent.click(canvas.getByRole("button", { name: "Week" }))
		await expect(await canvas.findByText("12 reactions on your hot take")).toBeInTheDocument()
	},
}

// a profile's news as another reader: no opener, and a row names the Comment's author
export const Profile: Story = {
	args: { profileUserId: "user-evan", userId: "user-roastfan", opener: null },
	play: async ({ canvas }) => {
		await expect(await canvas.findByText("12 reactions on Evan's hot take")).toBeInTheDocument()
		await expect(canvas.getByRole("heading", { name: "Brews News" })).toBeInTheDocument()
	},
}
