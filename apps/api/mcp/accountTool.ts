// read_account: the caller's plan, this month's spend against the budget with its cutoffs, the day's scans, and the
// month's image regenerations, with the plans page and the account page on carlnotes.com as links
import { PLANS_PATH } from "@carlnotes/contracts/plans"
import { SITE_URL } from "@carlnotes/contracts/site"
import { z } from "zod"
import { loadMonthlySpend } from "../activity"
import { loadBillingState } from "../billing"
import { loadMcpViewSession, toMcpViewMeta } from "./mcpViewData"
import { CONNECT_ACCOUNT_TEXT } from "./results"
import { type RegisterToolsOptions, toJsonResult, toTextResult } from "./toolShapes"
import { toMcpViewToolMeta } from "./uiResources"

// the account page, where a plan is managed and billing opens
const ACCOUNT_PATH = "/account"

/**
 * Registers read_account.
 */
export function registerAccountTool({ mcpServer, toolCaller }: RegisterToolsOptions): void {
	mcpServer.registerTool(
		"read_account",
		{
			title: "Read your account",
			description:
				"The connected account's CarlNotes plan and usage: the plan, this month's spend against the monthly budget with the shares where features pause, the day's scans against the daily limit, and the topic image regenerations left this month. Changing the plan or billing happens on carlnotes.com, whose links the result includes. Use it when the user asks Carl or CarlNotes about my plan, my usage, or how much budget is left.",
			inputSchema: z.object({}),
			annotations: { readOnlyHint: true, destructiveHint: false },
			_meta: toMcpViewToolMeta("account"),
		},
		async () => {
			if (toolCaller.kind !== "user") {
				return toTextResult(CONNECT_ACCOUNT_TEXT)
			}

			// the billing state and the spend meter the account page reads, and the caller the view heads with
			const { userId } = toolCaller
			const [billingState, spendMeter, session] = await Promise.all([
				loadBillingState(userId),
				loadMonthlySpend(userId),
				loadMcpViewSession(toolCaller),
			])
			const spentCents = spendMeter.scanSpendCents + spendMeter.chatSpendCents + spendMeter.podcastEpisodeSpendCents
			const accountResult = toJsonResult({
				plan: billingState.plan,
				billingInterval: billingState.billingInterval,
				paymentStatus: billingState.status,
				// this month's spend by what produced it, the budget, and the shares of it where features pause
				spend: {
					...spendMeter,
					spentCents,
					resetSchedule: "the first of each month, at midnight UTC",
				},
				// the day's scans, and the month's image regenerations, null for an admin with no limit
				dailyScans: {
					usedCount: billingState.dailyScansUsed,
					limit: billingState.dailyScanLimit,
					isOverageBillable: billingState.isOverageBillable,
					resetSchedule: "midnight UTC",
				},
				imageRegenerations: billingState.imageRegenerationQuota ?? null,
				// where the plan changes and billing opens, on the site
				plansUrl: `${SITE_URL}${PLANS_PATH}`,
				accountUrl: `${SITE_URL}${ACCOUNT_PATH}`,
			})

			// the view reads the account page's own shapes
			return {
				...accountResult,
				_meta: toMcpViewMeta({ session, podcastEpisodes: [], account: { billing: billingState, spendMeter } }),
			}
		},
	)
}
