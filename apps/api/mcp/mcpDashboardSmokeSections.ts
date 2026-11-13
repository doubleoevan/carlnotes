// the mcp smoke's sections for read_dashboard: a visitor's and the owner's reads of the owner's Topic Dashboard on /mcp
// and on the topic-bound route, with the full snapshot only for the owner

import { DASHBOARD_PAGE_NAMES, toDashboardPath } from "@carlnotes/contracts/dashboards"
import { MCP_VIEW_META_KEY, type McpViewData } from "@carlnotes/contracts/mcpViews"
import { SITE_URL } from "@carlnotes/contracts/site"
import { check, ownerId, routePaths, toClient, toResultJson } from "./mcpSmokeFixtures"
import { CONNECT_ACCOUNT_TEXT } from "./results"
import { toResultText } from "./toolTestFixtures"

// the owner's Topic Dashboard page, which every read below opens
const ownerDashboardUrl = `${SITE_URL}${toDashboardPath({ dashboardKind: "topicDashboard", subjectId: ownerId })}`

// what read_dashboard returns to the model
type DashboardResult = { pageName: string; summary: { dashboardKind: string }; url: string }

/** Checks a visitor's reads on both routes: no Dashboard of their own, and the owner's public one. */
export async function checkVisitorDashboardTool(): Promise<void> {
	for (const routePath of routePaths) {
		const { client, transport } = toClient(routePath)
		try {
			// a visitor names no person and gets the connect text
			await client.connect(transport)
			const ownResult = await client.callTool({ name: "read_dashboard", arguments: { dashboardKind: "topics" } })
			check(
				`${routePath}: read_dashboard returns the connect text to a visitor with no userId`,
				toResultText(ownResult) === CONNECT_ACCOUNT_TEXT,
			)

			// the owner's Topic Dashboard at the public level
			const ownerResult = await client.callTool({
				name: "read_dashboard",
				arguments: { dashboardKind: "topics", userId: ownerId },
			})
			checkOwnerDashboard(`${routePath} visitor`, ownerResult, false)
		} finally {
			// release the sdk transport after each route
			await client.close()
		}
	}
}

/** Checks the owner's reads of their own Topic Dashboard on both routes, with no userId, at the full level. */
export async function checkUserDashboardTool(accessToken: string): Promise<void> {
	for (const routePath of routePaths) {
		const { client, transport } = toClient(routePath, accessToken)
		try {
			// the connected account's own Topic Dashboard
			await client.connect(transport)
			const ownResult = await client.callTool({ name: "read_dashboard", arguments: { dashboardKind: "topics" } })
			checkOwnerDashboard(`${routePath} owner`, ownResult, true)
		} finally {
			// release the sdk transport after each route
			await client.close()
		}
	}
}

// checks one read of the owner's Topic Dashboard: its page name, summary, and url for the model, and the MCP view's
// access
function checkOwnerDashboard(label: string, toolResult: unknown, hasFullAccess: boolean): void {
	// the model's copy
	const dashboard = toResultJson<DashboardResult>(toolResult)
	check(`${label}: read_dashboard names Topic Specials`, dashboard.pageName === DASHBOARD_PAGE_NAMES.topicDashboard)
	check(
		`${label}: read_dashboard returns the Topic Dashboard summary`,
		dashboard.summary.dashboardKind === "topicDashboard",
	)
	check(`${label}: read_dashboard links the owner's page`, dashboard.url === ownerDashboardUrl, dashboard.url)

	// the MCP view's read and the caller's access
	const meta = (toolResult as { _meta?: Record<string, McpViewData | undefined> })._meta
	const mcpViewDashboard = meta?.[MCP_VIEW_META_KEY]?.dashboard
	check(
		`${label}: read_dashboard gives the MCP view ${hasFullAccess ? "the full" : "the public"} snapshot`,
		mcpViewDashboard?.hasFullAccess === hasFullAccess,
		mcpViewDashboard,
	)
}
