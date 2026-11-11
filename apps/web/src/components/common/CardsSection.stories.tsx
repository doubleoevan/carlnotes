// a section of cards: one page with no page buttons, two pages that keep every card in the html, and no cards
import { CARDS_PAGE_SIZE, type TopicCard as TopicCardFields } from "@carlnotes/contracts/home"
import { PROFILE_SECTIONS } from "@carlnotes/core/lib/profileSections"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { expect } from "storybook/test"
import { Accordion } from "@/components/primitives/accordion"
import { TopicCard } from "@/components/topic/TopicCard"
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
