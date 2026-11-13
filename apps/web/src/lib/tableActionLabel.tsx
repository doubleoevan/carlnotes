// the words a table row's control says in its tooltip and to a screen reader: the action, the name it acts on, and any
// words after the name
import type { ReactNode } from "react"

// the action, the name it acts on, and any words after the name
export type TableActionLabelParts = {
	action: string
	name?: string
	afterName?: string
}

/**
 * Returns a control's accessible name: the action, the name, and the words after it, as one line.
 */
export function toTableActionLabel({ action, name, afterName }: TableActionLabelParts): string {
	return [action, name, afterName].filter(Boolean).join(" ")
}

/**
 * Returns a control's tooltip: the action, the name in bold, and the words after it.
 */
export function toTableActionTooltip({ action, name, afterName }: TableActionLabelParts): ReactNode {
	return (
		<>
			{action} {name && <span className="font-semibold">{name}</span>}
			{afterName && ` ${afterName}`}
		</>
	)
}
