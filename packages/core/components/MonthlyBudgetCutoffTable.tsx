import { plans } from "@carlnotes/contracts/enums"
import type { ComponentType, ReactNode } from "react"
import { toMonthlyBudgetCutoffRows } from "../lib/monthlyBudgetCutoffs"
import { DataTable, type DataTableElements } from "./DataTable"

const SORT = { sortKey: null, isDescending: false, toggleSort: () => {} }

/**
 * Renders the same feature-window rows and plan headings on both platforms.
 */
export function MonthlyBudgetCutoffTable({
	elements,
	Text,
}: {
	elements: DataTableElements
	Text: ComponentType<{ children: ReactNode }>
}) {
	// every plan uses one catalog-derived set of cutoff rows
	const rows = toMonthlyBudgetCutoffRows()
	const columns = [
		{
			key: "line",
			label: "",
			width: 192,
			isSortable: false,
			render: (row: (typeof rows)[number]) => <Text>{row.line}</Text>,
		},
		...plans.map((plan) => ({
			key: plan,
			label: plan.charAt(0).toUpperCase() + plan.slice(1),
			width: 128,
			isSortable: false,
			render: (row: (typeof rows)[number]) => <Text>{row.planCells[plan]}</Text>,
		})),
	]
	return (
		<DataTable
			columns={columns}
			renderedRows={rows.map((row) => ({ row }))}
			getRowId={(row) => row.key}
			sort={SORT}
			elements={elements}
		/>
	)
}
