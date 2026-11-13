import type { ReactNode } from "react"
import type { TableColumn } from "../components/DataTable"
import type { RowSortOptions } from "../hooks/useRowSort"

// a sorted, paginated table each app draws in its own card, with its rows, columns, and starting sort
export type SortedTableProps<Row> = RowSortOptions<Row> & {
	columns: TableColumn<Row>[]
	getRowId: (row: Row) => string
}
export type SortedTableElement = <Row>(props: SortedTableProps<Row>) => ReactNode

// what a delete confirmation says, with the name it acts on apart
export type ConfirmationBody = {
	beforeTarget: string
	target: string
	afterTarget: string
	// the page the target links to, or none for a target shown in bold
	targetHref?: string
}

// a delete confirmation's words and its two answers
export type ConfirmationProps = {
	title: string
	confirmLabel: string
	cancelLabel: string
	body: ConfirmationBody
	onConfirm: () => Promise<void>
	onClose: () => void
}

/**
 * Returns a confirmation's body as one plain sentence.
 */
export function toConfirmationText({ beforeTarget, target, afterTarget }: ConfirmationBody): string {
	return beforeTarget + target + afterTarget
}
