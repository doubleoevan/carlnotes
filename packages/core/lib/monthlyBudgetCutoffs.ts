import { plans } from "@carlnotes/contracts/enums"
import { type MonthlyBudgetCutoffKind, monthlyBudgetCutoffKinds, PLANS, type Plan } from "@carlnotes/contracts/plans"
import { toSharePercentLabel } from "./labels"
import { MONTHLY_BUDGET_CUTOFF_COPY, SPENT_BUDGET_LIST_LINE, toCutoffTableLine } from "./monthlyBudgetCutoffCopy"

// one row of the monthly budget cutoff table: what stops, and the share of the monthly budget it stops at on each plan
export type MonthlyBudgetCutoffRow = { key: string; line: string; planCells: Record<Plan, string> }

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
