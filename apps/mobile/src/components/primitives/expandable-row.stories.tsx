import { EXPANDABLE_ROW_STORIES } from "@carlnotes/core/lib/expandableRowStories"
import type { Meta, StoryObj } from "@storybook/react-native"
import { ExpandableRow } from "./expandable-row"
import { Text } from "./text"

// match the web primitive stories through the same shared row and fixtures
const meta = {
	title: "Primitives/ExpandableRow",
	component: ExpandableRow,
	parameters: { webReference: "apps/web/src/components/primitives/expandable-row.stories.tsx at 375px" },
	args: { ...EXPANDABLE_ROW_STORIES.source, children: EXPANDABLE_ROW_STORIES.source.details },
	render: ({ children, ...props }) => (
		<ExpandableRow {...props}>
			<Text>{children}</Text>
		</ExpandableRow>
	),
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
