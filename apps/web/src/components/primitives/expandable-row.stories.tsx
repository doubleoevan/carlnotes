import { EXPANDABLE_ROW_STORIES } from "@carlnotes/core/lib/expandableRowStories"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { ExpandableRow } from "./expandable-row"

// the primitive keeps nested actions outside its disclosure trigger
const meta = {
	title: "Primitives/ExpandableRow",
	component: ExpandableRow,
	args: { ...EXPANDABLE_ROW_STORIES.source, children: EXPANDABLE_ROW_STORIES.source.details },
} satisfies Meta<typeof ExpandableRow>
export default meta
type Story = StoryObj<typeof meta>
export const Source: Story = {}
export const Section: Story = {
	args: { ...EXPANDABLE_ROW_STORIES.section, children: EXPANDABLE_ROW_STORIES.section.details },
}
export const Numbered: Story = {
	args: { ...EXPANDABLE_ROW_STORIES.item, children: EXPANDABLE_ROW_STORIES.item.details, ordinal: 1 },
}
export const Collapsed: Story = {}
export const Expanded: Story = { args: { initialOpen: true } }
export const LastItem: Story = {
	args: { ...EXPANDABLE_ROW_STORIES.item, children: EXPANDABLE_ROW_STORIES.item.details, isLast: true },
}
export const Item: Story = { args: { ...EXPANDABLE_ROW_STORIES.item, children: EXPANDABLE_ROW_STORIES.item.details } }
export const LongText: Story = {
	args: { ...EXPANDABLE_ROW_STORIES.long, children: EXPANDABLE_ROW_STORIES.long.details },
}
