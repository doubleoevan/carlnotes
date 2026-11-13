// the account MCP view through the test host: the budget cards with the month's image regenerations, a free user's
// plan link to the plans page, and a past-due subscriber's Update and plan link to the account page, none of which
// calls a tool
import { expect, test } from "bun:test"
import { PLANS_PATH, PURCHASE_COPY } from "@carlnotes/contracts/plans"
import type { BillingState } from "@carlnotes/contracts/profiles"
import { ACCOUNT_BUDGET_STORY_BILLING } from "@carlnotes/core/lib/accountBudgetStoryFixtures"
import { SPEND_METER_STORY_ACTIVITY } from "@carlnotes/core/lib/spendMeterStoryFixtures"
import type { McpViewToolResult } from "../mcpViewHost"
import { toMcpViewToolResult, USER_MCP_VIEW_DATA } from "./mcpViewFixtures"
import { waitForRecord, withMcpView } from "./mcpViewTestHarness"
import { TEST_SITE_URL } from "./mcpViewTestHost"

// a subscriber whose last payment failed
const PAST_DUE_BILLING: BillingState = {
	...ACCOUNT_BUDGET_STORY_BILLING,
	plan: "plus",
	status: "past_due",
	provider: "stripe",
}

/**
 * Returns a read_account result that holds the caller's billing and spend.
 */
export function toAccountToolResult(billing: BillingState = ACCOUNT_BUDGET_STORY_BILLING): McpViewToolResult {
	return toMcpViewToolResult({
		mcpViewData: { ...USER_MCP_VIEW_DATA, account: { billing, spendMeter: SPEND_METER_STORY_ACTIVITY } },
	})
}

test("the account MCP view shows the budget cards with the month's image regenerations and calls no tool", async () => {
	await withMcpView({ mcpView: "account" }, async ({ frame, toolCalls, sendToolResult }) => {
		await sendToolResult(toAccountToolResult())

		// both cards, the regenerations line, and no tool call
		await frame.getByText("Carl's coffee fund").waitFor()
		await frame.getByText("Brews today").first().waitFor()
		await frame.getByText("1 of 2 used this month").waitFor()
		expect(toolCalls).toEqual([])
	})
})

test("a free user's plan link opens the plans page on the site", async () => {
	await withMcpView({ mcpView: "account" }, async ({ frame, links, sendToolResult }) => {
		await sendToolResult(toAccountToolResult())
		await frame.getByRole("link", { name: PURCHASE_COPY.upgrade }).first().click()
		await waitForRecord(links)
		expect(links[0]).toBe(`${TEST_SITE_URL}${PLANS_PATH}`)
	})
})

test("a past-due subscriber's Update and plan link open the account page on the site", async () => {
	await withMcpView({ mcpView: "account" }, async ({ frame, links, toolCalls, sendToolResult }) => {
		await sendToolResult(toAccountToolResult(PAST_DUE_BILLING))

		// the notice's Update, then the plan link
		await frame.getByRole("link", { name: "Update" }).click()
		await waitForRecord(links)
		await frame.getByRole("link", { name: PURCHASE_COPY.managePlan }).first().click()
		await waitForRecord(links, 2)
		expect(links).toEqual([`${TEST_SITE_URL}/account`, `${TEST_SITE_URL}/account`])
		expect(toolCalls).toEqual([])
	})
})
