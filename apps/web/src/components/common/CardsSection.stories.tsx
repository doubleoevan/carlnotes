// a section of cards: one page with no page buttons, two pages that keep every card in the html, no cards, and the
// home's sections the server pages, a page at a time, with their page buttons as buttons or as links to each page
import { CARDS_PAGE_SIZE } from "@carlnotes/contracts/cardPages"
import type { TopicCard as TopicCardFields } from "@carlnotes/contracts/home"
import type { TopicPostCard as TopicPostCardFields } from "@carlnotes/contracts/topicPosts"
import type { ServerCardPages } from "@carlnotes/core/hooks/useServerPagedCards"
import { HOME_SECTIONS } from "@carlnotes/core/lib/homeFaces"
import { PROFILE_SECTIONS } from "@carlnotes/core/lib/profileSections"
import { TOPIC_POST_CARD_STORY } from "@carlnotes/core/lib/topicPostStories"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { expect } from "storybook/test"
import { Accordion } from "@/components/primitives/accordion"
import { TopicCard } from "@/components/topic/TopicCard"
import { TopicPostCard } from "@/components/topicPost/TopicPostCard"
import { PagedCardsSection } from "./CardsSection"

// the section the stories show, a profile's topics
const CARD_SECTION = PROFILE_SECTIONS.profileTopics

// a topic card with no image, by its place in the section
function toTopicCard(index: number): TopicCardFields & { isPublic: boolean } {
	return {
		id: `topic-${index}`,
		name: `Topic ${index + 1}`,
		path: `/topics/topic-${index}/topic-${index + 1}`,
		image: null,
		tags: ["coffee"],
		owner: { userId: "user-1", username: "CoffeeReader", avatarSource: "generated", avatarVersion: null },
		teamLink: null,
		reactionCount: index,
		latestPodcastEpisode: null,
		isPublic: true,
	}
}

// a section's rows, by how many it holds
const toTopicCards = (cardCount: number): ReturnType<typeof toTopicCard>[] =>
	Array.from({ length: cardCount }, (_, index) => toTopicCard(index))

const meta = {
	title: "Common/CardsSection",
	component: PagedCardsSection<ReturnType<typeof toTopicCard>>,
	args: {
		section: CARD_SECTION,
		rows: toTopicCards(4),
		renderCard: (topic) => <TopicCard topic={topic} onOpen={() => {}} />,
	},
	decorators: [
		(Story) => (
			<Accordion type="multiple" defaultValue={[CARD_SECTION.value]}>
				<Story />
			</Accordion>
		),
	],
} satisfies Meta<typeof PagedCardsSection<ReturnType<typeof toTopicCard>>>

export default meta
type Story = StoryObj<typeof meta>

// four cards fit one page, so the section shows its count and no page buttons
export const OnePage: Story = {
	play: async ({ canvas }) => {
		await expect(canvas.getByText("4 topics")).toBeInTheDocument()
		await expect(canvas.queryByRole("navigation")).toBeNull()
	},
}

// eight cards page six at a time, and the two off the page stay in the html
export const TwoPages: Story = {
	args: { rows: toTopicCards(8) },
	play: async ({ canvas }) => {
		// the page shows its six cards, the two off the page are hidden, and the page buttons sit under them
		await expect(canvas.getAllByRole("link", { name: /^Open Topic/ })).toHaveLength(CARDS_PAGE_SIZE)
		await expect(canvas.getAllByRole("link", { name: /^Open Topic/, hidden: true })).toHaveLength(8)
		await expect(canvas.getByRole("navigation", { name: "Featured Topics pages" })).toBeInTheDocument()
	},
}

// a section with no card shows nothing, not even its title
export const Empty: Story = {
	args: { rows: [] },
	play: async ({ canvas }) => {
		await expect(canvas.queryByText("Featured Topics")).toBeNull()
	},
}

// the server's pages of a whole list, six cards at a time, the first of which the page read holds
function toServerCardPages<Row>(queryKey: string, rows: Row[]): ServerCardPages<Row> {
	return {
		queryKey: ["story", queryKey],
		loadedPage: { rows: rows.slice(0, CARDS_PAGE_SIZE), page: 0, totalCount: rows.length },
		fetchPage: async (page) => ({
			rows: rows.slice(page * CARDS_PAGE_SIZE, (page + 1) * CARDS_PAGE_SIZE),
			totalCount: rows.length,
		}),
	}
}

// the home's Your topics, which the server pages: the html holds the first page, and a page button reads its page
const YOUR_TOPICS = toTopicCards(14)
export const HomeYourTopicsPagedOnServer: Story = {
	render: () => (
		<Accordion type="multiple" defaultValue={[HOME_SECTIONS.yourTopics.value]}>
			<PagedCardsSection
				section={HOME_SECTIONS.yourTopics}
				rows={YOUR_TOPICS.slice(0, CARDS_PAGE_SIZE)}
				serverPages={toServerCardPages("your-topics", YOUR_TOPICS)}
				renderCard={(topic) => <TopicCard topic={topic} onOpen={() => {}} />}
			/>
		</Accordion>
	),
	play: async ({ canvas }) => {
		// the first page alone, with the count of every topic
		await expect(canvas.getByText("14 topics")).toBeInTheDocument()
		await expect(canvas.getAllByRole("link", { name: /^Open Topic/, hidden: true })).toHaveLength(CARDS_PAGE_SIZE)

		// the last page shows its two topics
		await canvas.getByRole("button", { name: "3" }).click()
		await expect(await canvas.findByRole("link", { name: "Open Topic 14" })).toBeInTheDocument()
	},
}

// the home's new posts this week, which the server pages with links to each page, so a reader without JavaScript and
// a crawler reach every post. with JavaScript a link opens its page in place
const NEWEST_TOPIC_POSTS: TopicPostCardFields[] = Array.from({ length: 9 }, (_, index) => ({
	...TOPIC_POST_CARD_STORY,
	id: `post-${index + 1}`,
	title: `Post ${index + 1}`,
}))
export const HomeNewestTopicPostsPagedOnServer: Story = {
	render: () => (
		<Accordion type="multiple" defaultValue={[HOME_SECTIONS.newestTopicPosts.value]}>
			<PagedCardsSection
				section={HOME_SECTIONS.newestTopicPosts}
				rows={NEWEST_TOPIC_POSTS.slice(0, CARDS_PAGE_SIZE)}
				serverPages={toServerCardPages("newest-topic-posts", NEWEST_TOPIC_POSTS)}
				renderCard={(topicPost) => <TopicPostCard topicPost={topicPost} onOpen={() => {}} />}
			/>
		</Accordion>
	),
	play: async ({ canvas }) => {
		// the second page's link names its page in the url, and opens the page in place
		const secondPageLink = canvas.getByRole("link", { name: "2" })
		await expect(secondPageLink.getAttribute("href")).toContain("newPosts=2")
		await secondPageLink.click()
		await expect(await canvas.findByText("Post 9")).toBeInTheDocument()
	},
}
