import { DataTable } from "@carlnotes/core/components/DataTable"
import { useRowSort } from "@carlnotes/core/hooks/useRowSort"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { DATA_TABLE_ELEMENTS } from "./DataTable"
import { TableCard } from "./TableCard"

// the shared renderer keeps column order, sort controls, and totals together
function TableExample() {
	const sort = useRowSort({
		rows: [{ id: "coffee", name: "Coffee", count: 3 }],
		valueByKey: { name: (row) => row.name, count: (row) => row.count },
	})
	return (
		<TableCard>
			<DataTable
				columns={[
					{ key: "name", label: "Topic", width: 192, render: (row) => row.name, footer: "Total" },
					{ key: "count", label: "Followers", width: 112, render: (row) => row.count, footer: 3 },
				]}
				renderedRows={sort.sortedRows.map((row) => ({ row }))}
				getRowId={(row) => row.id}
				sort={sort}
				elements={DATA_TABLE_ELEMENTS}
			/>
		</TableCard>
	)
}

const meta = { title: "Table/DataTable", component: TableExample } satisfies Meta<typeof TableExample>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
