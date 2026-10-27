import { cn } from "@carlnotes/nightshift/classNames"
import type { Meta, StoryObj } from "@storybook/react-native"
import { View } from "react-native"
import { Text } from "@/components/primitives/text"
import { TableCard } from "./TableCard"
import { TableCell, TableScroll } from "./TableScroll"

// exercise the web's fixed first column with wrapping and a visible overflow cue
const meta = {
	title: "Table/TableScroll",
	component: TableScroll,
	parameters: { webReference: "apps/web/src/nightshift/patterns/Table.stories.tsx" },
	args: { columns: { name: 192, visibility: 112, updated: 112 }, children: null },
	render: (args) => (
		<TableCard className="w-full">
			<TableScroll {...args}>
				{["Note", "A long Tasting Note name that wraps across several lines", "Coffee for two"].map((name, i) => (
					<View key={name} className={cn("min-h-12 flex-row", i < 2 && "border-b border-separator")}>
						<TableCell column="name">
							<Text className="text-link">{name}</Text>
						</TableCell>
						<TableCell column="visibility">
							<Text>Private</Text>
						</TableCell>
						<TableCell column="updated">
							<Text>today</Text>
						</TableCell>
					</View>
				))}
			</TableScroll>
		</TableCard>
	),
} satisfies Meta<typeof TableScroll>
export default meta
type Story = StoryObj<typeof meta>
export const Overflow: Story = {}
export const ContentFits: Story = { args: { columns: { name: 80, visibility: 72, updated: 72 } } }
