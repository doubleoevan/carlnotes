// the monthly budget reset job, which replaces every LiteLLM key created before the month began.
// a platform cron runs the job once a day shortly after midnight utc
import { shutdownAnalytics } from "@shared/analytics"
import { reportError, shutdownMonitoring, startMonitoring } from "@shared/monitoring"
import { runWithClaim } from "../db/claim"
import { resetMonthlyBudgets } from "./litellm"

// the reset's claim, so two overlapping resets cannot replace a key twice
const MONTHLY_BUDGET_RESET_CLAIM = "monthly-budget-reset"

// report the reset's errors to Sentry
startMonitoring()

// run one reset under the claim and log what the reset did
try {
	const budgetResetSummary = await runWithClaim({ claimName: MONTHLY_BUDGET_RESET_CLAIM, runTask: resetMonthlyBudgets })
	console.log(
		budgetResetSummary
			? `monthly budget reset: ${budgetResetSummary.replacedCount} keys replaced, ${budgetResetSummary.failedCount} failed`
			: "monthly budget reset: another reset holds the claim, so this one did nothing",
	)
} catch (error) {
	// report a reset that failed and exit non-zero so the cron run shows as failed.
	// the next day's reset tries every key still due
	console.error("monthly budget reset failed", error)
	reportError(error, "billing")
	process.exitCode = 1
} finally {
	// flush every report before the process exits, no matter how the reset ended
	await shutdownAnalytics()
	await shutdownMonitoring()
}
