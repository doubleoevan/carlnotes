import { plans } from "@carlnotes/contracts/enums"
import { type MonthlyBudgetCutoffKind, monthlyBudgetCutoffKinds, PLANS, type Plan } from "@carlnotes/contracts/plans"
import { toSharePercentLabel } from "@carlnotes/core/lib/labels"
import { TableCard } from "@/components/table/TableCard"
import { ONE_PAGE_TABLE_CARD_CLASS, TABLE_CLASS, TABLE_HEAD_CLASS, TABLE_SCROLL_CLASS } from "@/lib/styleClasses"
import { cn } from "@/lib/utils"
import { MONTHLY_BUDGET_CUTOFF_COPY, SPENT_BUDGET_LIST_LINE, toCutoffTableLine } from "./monthlyBudgetCutoffCopy"

// one row of the monthly budget cutoff table: what stops, and the share of the monthly budget it stops at on each plan
export type MonthlyBudgetCutoffRow = { key: string; line: string; planCells: Record<Plan, string> }

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
				<div className={TABLE_SCROLL_CLASS}>
					<table className={TABLE_CLASS}>
						{/* an empty cell over what stops, then a column per plan */}
						<thead className={TABLE_HEAD_CLASS}>
							<tr>
								<th className="py-2 pr-4" />
								{plans.map((plan) => (
									<th key={plan} className="py-2 pr-4 font-normal capitalize">
										{plan}
									</th>
								))}
							</tr>
						</thead>
						<tbody>
							{toMonthlyBudgetCutoffRows().map((monthlyBudgetCutoffRow) => (
								<tr key={monthlyBudgetCutoffRow.key} className="border-b">
									<td className="py-2 pr-4">{monthlyBudgetCutoffRow.line}</td>
									{plans.map((plan) => (
										<td key={plan} className="text-muted-foreground py-2 pr-4 tabular-nums">
											{monthlyBudgetCutoffRow.planCells[plan]}
										</td>
									))}
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</TableCard>
		</section>
	)
}

/**
 * Returns the monthly budget cutoff table's rows: each cutoff in the order the plans stop them, with each plan's share
 * or the cutoff's label for a plan with no fixed share, then the spent budget at 100% on every plan.
 */
export function toMonthlyBudgetCutoffRows(): MonthlyBudgetCutoffRow[] {
	// a row for each cutoff
	const cutoffRows = monthlyBudgetCutoffKinds.map((kind) => ({
		key: kind,
		line: toCutoffTableLine(kind),
		planCells: toPlanCells((plan) => toPlanCell(plan, kind)),
	}))

	// then the spent budget
	return [
		...cutoffRows,
		{ key: "spent", line: SPENT_BUDGET_LIST_LINE, planCells: toPlanCells(() => toSharePercentLabel(1)) },
	]
}

// one cell per plan
function toPlanCells(toCell: (plan: Plan) => string): Record<Plan, string> {
	return Object.fromEntries(plans.map((plan) => [plan, toCell(plan)])) as Record<Plan, string>
}

// a plan's cell for one cutoff: its share as a percent, or the cutoff's label for a plan with no fixed share
function toPlanCell(plan: Plan, kind: MonthlyBudgetCutoffKind): string {
	const budgetShare = kind === "dailyScans" ? null : PLANS[plan].monthlyBudgetCutoffShares[kind]
	return budgetShare === null
		? (MONTHLY_BUDGET_CUTOFF_COPY[kind].noShareLabel ?? "None")
		: toSharePercentLabel(budgetShare)
}
