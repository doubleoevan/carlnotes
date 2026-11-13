// read_account: the plan and usage come back with links to the plans and account pages and no purchase action, and a
// visitor is asked to connect an account
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { MCP_VIEW_META_KEY } from "@carlnotes/contracts/mcpViews"
import type { BillingState } from "@carlnotes/contracts/profiles"
import * as activity from "../activity"
import * as billing from "../billing"
import * as mcpViewData from "./mcpViewData"
import { CONNECT_ACCOUNT_TEXT } from "./results"
import { toResultText, toToolHandler, VISITOR } from "./toolTestFixtures"

// put the spies back after each test
afterEach(() => {
	mock.restore()
})

test("the plan and usage come back with the plans and account links and no purchase action", async () => {
	// a free plan with one regeneration used, and a month's spend split three ways
	spyOn(billing, "loadBillingState").mockResolvedValue({
		plan: "free",
		billingInterval: "monthly",
		status: null,
		dailyScansUsed: 1,
		dailyScanLimit: 3,
		isOverageBillable: false,
		imageRegenerationQuota: { used: 1, limit: 2 },
	} as unknown as BillingState)
	spyOn(activity, "loadMonthlySpend").mockResolvedValue({
		scanSpendCents: 50,
		chatSpendCents: 20,
		podcastEpisodeSpendCents: 30,
		budgetCents: 200,
		monthlyBudgetCutoffs: [],
	})
	spyOn(mcpViewData, "loadMcpViewSession").mockResolvedValue(null)
	const toolResult = await toToolHandler("read_account")({})

	// the total spend, the regenerations, and the two links
	expect(toolResult.structuredContent).toMatchObject({
		plan: "free",
		spend: { spentCents: 100, budgetCents: 200 },
		dailyScans: { usedCount: 1, limit: 3 },
		imageRegenerations: { used: 1, limit: 2 },
	})
	const resultText = toResultText(toolResult)
	expect(resultText).toContain("/plans")
	expect(resultText).toContain("/account")
	expect(resultText).not.toMatch(/checkout|portal/i)

	// the account MCP view reads the billing state and the spend meter as the account page does
	expect(toolResult._meta?.[MCP_VIEW_META_KEY]).toMatchObject({
		account: { billing: { plan: "free" }, spendMeter: { budgetCents: 200 } },
	})
})

test("a visitor is asked to connect an account", async () => {
	expect(toResultText(await toToolHandler("read_account", VISITOR)({}))).toBe(CONNECT_ACCOUNT_TEXT)
})
