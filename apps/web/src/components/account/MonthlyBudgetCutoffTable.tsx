import { MonthlyBudgetCutoffTable as SharedMonthlyBudgetCutoffTable } from "@carlnotes/core/components/MonthlyBudgetCutoffTable"
import { cn } from "@carlnotes/nightshift/classNames"
import type { ReactNode } from "react"
import { DATA_TABLE_ELEMENTS } from "@/components/table/DataTable"
import { TableCard } from "@/components/table/TableCard"
import { ONE_PAGE_TABLE_CARD_CLASS } from "@/lib/styleClasses"

export { toMonthlyBudgetCutoffRows } from "@carlnotes/core/lib/monthlyBudgetCutoffs"

/**
 * The plans page's monthly budget cutoff table: what each plan stops as the month's spend climbs, and at what share of
 * the monthly budget, from each plan's monthly budget cutoffs. It has every row on one page.
 */
export function MonthlyBudgetCutoffTable() {
	return (
		<section className="mt-10">
			<h2 className="font-display text-xl">Feature windows</h2>
			<p className="text-muted-foreground mt-1 text-sm">
				Features pause until the next month as Carl runs out of coffee.
			</p>
			<TableCard className={cn("mt-3", ONE_PAGE_TABLE_CARD_CLASS)}>
				<SharedMonthlyBudgetCutoffTable elements={DATA_TABLE_ELEMENTS} Text={CutoffText} />
			</TableCard>
		</section>
	)
}

// keep table text styled consistently with the web
function CutoffText({ children }: { children: ReactNode }) {
	return <span className="text-muted-foreground tabular-nums">{children}</span>
}
