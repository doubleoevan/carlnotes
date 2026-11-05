import { toTestTopicFeed } from "@carlnotes/contracts/topicFeedTestFixtures"
import type { ExpandableRowProps } from "@carlnotes/core/components/ExpandableRow"
import { TopicPersonalSourcesSectionStory } from "@carlnotes/core/components/TopicPersonalSourcesSectionStory"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { Button } from "@/components/primitives/button"
import { ExpandableRow } from "@/components/primitives/expandable-row"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/primitives/popover"
import { POPOVER_PANEL_CLASS } from "@/lib/styleClasses"
import { PERSONAL_SOURCES_ELEMENTS } from "./personalSourcesElements"
import { TopicInfo } from "./TopicInfo"

// show the same Topic info content used by the Topic page
const meta = {
	title: "Topic/TopicInfo",
	component: TopicInfo,
	args: { topic: toTestTopicFeed({ visibility: "private", findings: [], scanSummary: null }) },
} satisfies Meta<typeof TopicInfo>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = { render: () => <InfoStory isClosed /> }

// render both flat item states inside the real platform popover
export const PersonalSourcesCollapsed: Story = { render: () => <InfoStory isClosed /> }
export const PersonalSourcesWithItems: Story = { render: () => <InfoStory /> }
export const PersonalSourcesExpanded: Story = { render: () => <InfoStory isExpanded /> }
export const PersonalSourcesEmpty: Story = { render: () => <InfoStory isEmpty /> }
export const Paginated: Story = { render: () => <InfoStory isPaged /> }
function ExpandedRow(props: ExpandableRowProps) {
	return <ExpandableRow {...props} initialOpen />
}
const EXPANDED_ELEMENTS = { ...PERSONAL_SOURCES_ELEMENTS, ExpandableRow: ExpandedRow }
function InfoStory({
	isExpanded = false,
	isEmpty = false,
	isClosed = false,
	isPaged = false,
}: {
	isExpanded?: boolean
	isEmpty?: boolean
	isClosed?: boolean
	isPaged?: boolean
}) {
	// fictional owner data stays local to the story
	const topic = toTestTopicFeed({
		name: "LLM evals",
		prompt: "New methods for evaluating LLM agents, especially catching drift and regressions before users do.",
		visibility: "private",
		findings: [],
		scanSummary: null,
	})
	const personalSources = (
		<TopicPersonalSourcesSectionStory
			className="border-t border-dashed border-separator-strong"
			elements={PERSONAL_SOURCES_ELEMENTS}
			expandedElements={EXPANDED_ELEMENTS}
			isItemExpanded={isExpanded}
			initialOpen={!isClosed}
			variant={isEmpty ? "empty" : isPaged ? "paged" : "ready"}
		/>
	)
	return (
		<Popover defaultOpen>
			<PopoverTrigger asChild>
				<Button>Topic details</Button>
			</PopoverTrigger>
			<PopoverContent className={POPOVER_PANEL_CLASS}>
				<TopicInfo topic={topic} personalSources={personalSources} />
			</PopoverContent>
		</Popover>
	)
}
