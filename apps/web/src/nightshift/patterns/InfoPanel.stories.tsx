// the info panel pattern: a wide popover with a centered heading and a close button, as a topic finding's info opens
import { DAY_MS } from "@carlnotes/contracts/time"
import { cn } from "@carlnotes/nightshift/classNames"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { useId, useState } from "react"
import { Popover, PopoverAnchor, PopoverCloseButton, PopoverContent } from "@/components/primitives/popover"
import { TopicFindingHeading, TopicFindingStats } from "@/components/topic/ResourceInfo"
import { ResourceMetadata, TopicFindingSummary } from "@/components/topic/TopicFindingSummary"
import { ScrollBox, toNotesMarkdown } from "@/components/topic/TopicScanRecap"
import {
	DASHED_ROW_CLASS,
	LIST_ROW_HOVER_CLASS,
	POPOVER_HEADING_CLASS,
	POPOVER_PANEL_CLASS,
	RESOURCE_LIST_CARD_CLASS,
	SECTION_LABEL_CLASS,
} from "@/lib/styleClasses"
import { LLM_TOOLING_TOPIC_FIXTURE } from "../../../.storybook/fixtures"
import { toStoryTopicFinding } from "../../../.storybook/fixtures/topicFeed"
import { toOwnFrameDocs } from "../../../.storybook/parameters"

// the notes long enough to make the scroll box scroll
const LONG_NOTES = Array.from(
	{ length: 12 },
	() =>
		"The post compares three LLM tooling stacks on the same retrieval task and reports latency, cost, and accuracy for each.",
).join(" ")

// the finding the row shows and the panel opens on. it was published three days before now, so its age reads 3d
const STORY_TOPIC_FINDING = toStoryTopicFinding({
	findingId: "finding-llm-tooling-compared",
	resourceId: "resource-llm-tooling-compared",
	url: "https://example.com/llm-tooling-compared",
	title: "Three LLM tooling stacks, one retrieval task",
	publishedAt: new Date(Date.now() - 3 * DAY_MS).toISOString(),
	viewCount: 1284,
	relevanceExplanation: "",
})

/**
 * Renders the info panel the way a topic finding's info opens: a click on the finding's row opens the heading, the
 * finding, Carl's notes, and its stats, anchored at the row's right edge.
 */
function InfoPanelPattern(infoPanelProps: InfoPanelProps) {
	// a new key remounts the row, so the open control applies on every change
	return <TopicFindingRowPanel key={String(infoPanelProps.isOpen)} {...infoPanelProps} />
}

// the panel's heading, the finding's title, carl's notes on the finding, and whether the panel starts open
type InfoPanelProps = { heading: string; findingTitle: string; notes: string; isOpen: boolean }

// the finding's row, which owns the panel's open state, and the panel itself
function TopicFindingRowPanel({ heading, findingTitle, notes, isOpen }: InfoPanelProps) {
	// the finding with the title and notes from the controls, and the heading that names the panel for a screen reader
	const topicFinding = { ...STORY_TOPIC_FINDING, title: findingTitle, relevanceExplanation: notes }
	const headingId = useId()
	const [isPanelOpen, setIsPanelOpen] = useState(isOpen)

	return (
		<Popover open={isPanelOpen} onOpenChange={setIsPanelOpen}>
			{/* the finding's row in its list card. the whole row opens the panel */}
			<div className={cn(RESOURCE_LIST_CARD_CLASS, "p-1")}>
				{/* biome-ignore lint/a11y/useKeyWithClickEvents: reachable by keyboard through the title trigger */}
				{/* biome-ignore lint/a11y/noStaticElementInteractions: a pointer shortcut over children that have the semantics */}
				<div
					onClick={() => setIsPanelOpen(true)}
					className={cn(DASHED_ROW_CLASS, LIST_ROW_HOVER_CLASS, "group flex cursor-pointer")}
				>
					{/* the rank, then the finding with its title as the trigger */}
					<span
						className="text-muted-foreground absolute top-0 left-0 grid size-11 place-items-center sm:top-1.5 sm:size-8"
						aria-hidden="true"
					>
						<span className="font-display text-sm tabular-nums">1</span>
					</span>
					<TopicFindingSummary resource={topicFinding} className="flex-1 py-3 pr-3 pl-9" />
					{/* the panel anchors here, off the row's right edge */}
					<PopoverAnchor className="pointer-events-none absolute top-1.5 right-1 size-11 sm:size-8" />
				</div>
			</div>

			{/* a click inside the portal still bubbles to the row in react, so the panel stops it */}
			<PopoverContent
				onClick={(event) => event.stopPropagation()}
				align="end"
				className={POPOVER_PANEL_CLASS}
				aria-labelledby={headingId}
			>
				<PopoverCloseButton />
				<h2 id={headingId} className={POPOVER_HEADING_CLASS}>
					{heading}
				</h2>

				{/* the finding's rank and its title, linked to the page, over its favicon, host, and age */}
				<TopicFindingHeading topicFindingRank={1} title={findingTitle} url={topicFinding.url}>
					<ResourceMetadata resource={topicFinding} />
				</TopicFindingHeading>

				{/* carl's notes in the scroll box, with the copy button on its corner */}
				<div className={cn(SECTION_LABEL_CLASS, "mb-1")}>{"Carl's notes"}</div>
				<ScrollBox
					copyMarkdown={toNotesMarkdown({
						topicId: LLM_TOOLING_TOPIC_FIXTURE.id,
						topicName: LLM_TOOLING_TOPIC_FIXTURE.name,
						prompt: LLM_TOOLING_TOPIC_FIXTURE.prompt,
						note: `[${findingTitle}](${topicFinding.url})\n\n${notes}`,
					})}
				>
					<p>{notes}</p>
				</ScrollBox>

				{/* when the finding was fetched and how many users opened it */}
				<TopicFindingStats fetchedAt={topicFinding.fetchedAt} viewCount={topicFinding.viewCount} />
			</PopoverContent>
		</Popover>
	)
}

const meta = {
	title: "Patterns/InfoPanel",
	component: InfoPanelPattern,
	args: {
		heading: "Topic Finding",
		findingTitle: "Three LLM tooling stacks, one retrieval task",
		notes: "A side-by-side test of three LLM tooling stacks, with the numbers to back it up.",
		isOpen: true,
	},
	argTypes: {
		heading: { control: "text" },
		findingTitle: { control: "text" },
		notes: { control: "text" },
		isOpen: { control: "boolean" },
	},
	parameters: {
		// the docs page shows each story in its own frame. an open popover portals out of an inline story
		docs: toOwnFrameDocs(520),
	},
	// room under the finding's row for the open panel
	decorators: [
		(Story) => (
			<div style={{ minHeight: 480 }}>
				<Story />
			</div>
		),
	],
} satisfies Meta<typeof InfoPanelPattern>

export default meta
type Story = StoryObj<typeof meta>

// the panel open with short notes
export const Open: Story = {}

// notes long enough to scroll the scroll box
export const LongNotes: Story = {
	args: { notes: LONG_NOTES },
}

// a title long enough to wrap beside its rank
export const LongTitle: Story = {
	args: {
		findingTitle:
			"What we learned running three LLM tooling stacks against the same retrieval benchmark for a whole quarter",
	},
}

// the finding's row alone, with the panel closed
export const Closed: Story = { args: { isOpen: false } }
