// the three card class strings: the plain card, the info card, and the card around a list of rows
import { fetchScanNote } from "@carlnotes/client/topicClient"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import type { ComponentProps } from "react"
import { mocked } from "storybook/test"
import { InfoSection, TopicSourcesSection, TopicVisibility } from "@/components/topic/TopicInfo"
import { TopicScanHistoryCard } from "@/components/topic/TopicScanHistory"
import {
	CARD_CLASS,
	INFO_CARD_CLASS,
	INFO_CARD_SECTIONS_CLASS,
	INFO_SECTION_PAIR_CLASS,
	INFO_SECTION_PAIR_END_CLASS,
} from "@/lib/styleClasses"
import { LLM_TOOLING_TOPIC_FIXTURE, STORY_USER, toStoryEmail } from "../../../.storybook/fixtures"
import { SCAN_NOTE_FIXTURE, TOPIC_SCAN_FIXTURES } from "../../../.storybook/fixtures/topics"

// the sources the settings card lists: web search, a subreddit, and two RSS feeds, each read with no error
const STORY_SOURCES: ComponentProps<typeof TopicSourcesSection>["sources"] = [
	{ id: "source-web", sourceKind: "search", summary: "", value: "", status: "ready", error: null },
	{
		id: "source-reddit",
		sourceKind: "reddit",
		summary: "r/LocalLLaMA",
		value: "LocalLLaMA",
		status: "ready",
		error: null,
	},
	{
		id: "source-simon",
		sourceKind: "rss",
		summary: "simonwillison.net",
		value: "https://simonwillison.net/atom/everything/",
		status: "ready",
		error: null,
	},
	{
		id: "source-hugging-face",
		sourceKind: "rss",
		summary: "huggingface.co",
		value: "https://huggingface.co/blog/feed.xml",
		status: "ready",
		error: null,
	},
]

// the width each card takes: the account page's full column, and the topic page's 32rem column and the one beside it
const CARD_WIDTHS = { card: undefined, infoCard: 512, resourceListCard: 480 }

// the card class strings the story shows
type CardName = keyof typeof CARD_WIDTHS

/**
 * Renders one of the app's card class strings with the content the app puts in it.
 */
function CardPattern({ card, isEmpty }: { card: CardName; isEmpty: boolean }) {
	if (card === "infoCard") {
		return <InfoCardContent />
	}
	// the topic page's scan history card: one row per scan, each drawing its own dashed separator, or the empty line
	if (card === "resourceListCard") {
		return (
			<TopicScanHistoryCard
				scans={isEmpty ? [] : TOPIC_SCAN_FIXTURES}
				pageNumber={1}
				topic={LLM_TOOLING_TOPIC_FIXTURE}
			/>
		)
	}

	// the account page's Email card: a bold title over its muted line, then the user's address
	return (
		<section className={CARD_CLASS}>
			<h3 className="font-semibold">Email</h3>
			<p className="text-muted-foreground mt-1 text-sm">
				{"Scans are delivered here. It's also how you sign in with a password."}
			</p>
			<p className="mt-2 text-sm">{toStoryEmail(STORY_USER.username)}</p>
		</section>
	)
}

// the topic page's settings card: labeled sections split by dashed dividers
function InfoCardContent() {
	return (
		<div className={INFO_CARD_CLASS}>
			<div className={INFO_CARD_SECTIONS_CLASS}>
				{/* the frequency over the last scan's age */}
				<InfoSection label="Frequency">
					Daily at 9:00 AM
					<div className="text-muted-foreground mt-0.5 text-xs">last scan today</div>
				</InfoSection>
				{/* two sections in one row, the second at the right */}
				<div className={INFO_SECTION_PAIR_CLASS}>
					<InfoSection label="Max findings" className="py-0">
						{"Carl's top 10"}
					</InfoSection>
					<InfoSection label="Visibility" className={INFO_SECTION_PAIR_END_CLASS}>
						<TopicVisibility visibility="public" />
					</InfoSection>
				</div>
				{/* where Carl looks, one line per source */}
				<TopicSourcesSection sources={STORY_SOURCES} />
			</div>
		</div>
	)
}

const meta = {
	title: "Patterns/Card",
	component: CardPattern,
	args: { card: "card", isEmpty: false },
	argTypes: {
		card: { control: "inline-radio", options: Object.keys(CARD_WIDTHS) },
		isEmpty: { control: "boolean", if: { arg: "card", eq: "resourceListCard" } },
	},
	// a card fills its column, so the story gives it the column the app puts it in
	decorators: [
		(Story, { args }) => (
			<div style={{ maxWidth: CARD_WIDTHS[args.card] }}>
				<Story />
			</div>
		),
	],
	// a scan row's popover loads its scan note, with its source results chart, from the mocked topic client
	beforeEach: () => {
		mocked(fetchScanNote).mockResolvedValue(SCAN_NOTE_FIXTURE)
	},
} satisfies Meta<typeof CardPattern>

export default meta
type Story = StoryObj<typeof meta>

// CARD_CLASS: the account page's Email card, across the page column
export const Card: Story = {}

// INFO_CARD_CLASS: the topic page's settings card with its labeled sections
export const InfoCard: Story = { args: { card: "infoCard" } }

// RESOURCE_LIST_CARD_CLASS: the scan history card with its dashed rows
export const ResourceListCard: Story = { args: { card: "resourceListCard" } }

// the scan history card with no scans yet
export const ResourceListCardEmpty: Story = { args: { card: "resourceListCard", isEmpty: true } }
