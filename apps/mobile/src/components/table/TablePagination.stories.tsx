import { usePagination } from "@carlnotes/core/hooks/usePagination"
import type { Meta, StoryObj } from "@storybook/react-native"
import { TablePagination } from "./TablePagination"

// use serializable rows to exercise the same page-size and page selection as a real table
const ROWS = Array.from({ length: 23 }, (_, index) => index)
const meta: Meta<typeof TablePagination> = {
	title: "Table/TablePagination",
	component: TablePagination,
	parameters: { webReference: "apps/web/src/components/table/TablePagination.tsx at 375px" },
	render: function Example() {
		const { pagination } = usePagination(ROWS, 5)
		return <TablePagination pagination={pagination} />
	},
}
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
