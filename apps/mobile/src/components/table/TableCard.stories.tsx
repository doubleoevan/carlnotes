import type { Meta, StoryObj } from "@storybook/react-native"
import { Text } from "@/components/primitives/text"
import { TableCard, TableHeader, TableRow } from "./TableCard"

// the table owns its shared surface and separators
const meta = {
	title: "Table/TableCard",
	component: TableCard,
	parameters: { webReference: "apps/web/src/components/table/TableCard.tsx" },
	args: { children: null },
	render: () => (
		<TableCard>
			<TableHeader>
				<Text className="text-sm text-muted-foreground">Topic</Text>
			</TableHeader>
			<TableRow>
				<Text className="text-sm text-link">Coffee for two</Text>
			</TableRow>
			<TableRow isLast>
				<Text className="text-sm text-link">A longer Topic name that wraps with larger text</Text>
			</TableRow>
		</TableCard>
	),
} satisfies Meta<typeof TableCard>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
