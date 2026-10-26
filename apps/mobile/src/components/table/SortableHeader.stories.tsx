import { useRowSort } from "@carlnotes/core/hooks/useRowSort"
import type { Meta, StoryObj } from "@storybook/react-native"
import { SortableHeader } from "./SortableHeader"

// compare the same named web component at phone width
const meta: Meta<typeof SortableHeader> = {
	title: "Table/SortableHeader",
	component: SortableHeader,
	parameters: { webReference: "apps/web/src/components/table/SortableHeader.tsx at 375px", surface: "card" },
	args: { label: "Topic", sortKey: "name" },
	render: (args) => {
		const sort = useRowSort({ rows: [], valueByKey: {} })
		return <SortableHeader {...args} sort={sort} />
	},
}
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
