import { db } from "@carlnotes/db"
import { findings } from "@carlnotes/db/schema/scans"
import { users } from "@carlnotes/db/schema/users"
import { eq } from "drizzle-orm"
import { loadOpenReports } from "../report/adminReports"
import { checkBoundRejections, type SmokeClient } from "./mcpResultSmokeSections"
import { check, insertSmokeUser, ownerId, runId, topicId, withClient } from "./mcpSmokeFixtures"
import { toResultText } from "./toolTestFixtures"

// the person the owner blocks, and Resend's test inbox, which accepts a report's email and delivers it nowhere
const blockedUserId = `${runId}-blocked`
const TEST_SUPPORT_EMAIL = "delivered@resend.dev"

/** Checks the report, block, and hot take delete tools on both routes, with the blocked person removed after. */
export async function checkReportTools(accessToken: string): Promise<void> {
	// the person to block, and one of the owner's findings to post on and report
	await insertSmokeUser(blockedUserId)
	const [findingRow] = await db.select({ id: findings.id }).from(findings).where(eq(findings.topicId, topicId)).limit(1)
	const findingId = findingRow?.id ?? ""
	try {
		// the report, the block, and the delete on /mcp, then the bound route
		await withClient("/mcp", accessToken, async (client) => {
			await checkReport(client, findingId)
			await checkBlock(client)
			await checkHotTakeDelete(client, findingId, "/mcp")
		})

		// the bound route rejects the account's writes and deletes on its own topic
		await withClient(`/mcp/t/${topicId}`, accessToken, async (client) => {
			await checkBoundRoute(client, findingId)
			await checkHotTakeDelete(client, findingId, "bound route")
		})
	} finally {
		// the owner's reports leave with the owner's account
		await db.delete(users).where(eq(users.id, blockedUserId))
	}
}

// the owner reports a finding, and the admin console's open reports list it
async function checkReport(client: SmokeClient, findingId: string): Promise<void> {
	// the report, mailed to the test inbox in place of the support address
	const supportEmail = Bun.env.SUPPORT_EMAIL
	Bun.env.SUPPORT_EMAIL = TEST_SUPPORT_EMAIL
	try {
		const reportResult = await client.callTool({
			name: "report_content",
			arguments: { subject_kind: "finding", subject_id: findingId, reason: `${runId} smoke report` },
		})
		check("/mcp: report_content reports a finding", !reportResult.isError, toResultText(reportResult))
	} finally {
		Bun.env.SUPPORT_EMAIL = supportEmail
	}

	// the open reports the admin console lists
	const openReports = await loadOpenReports()
	check(
		"/mcp: the admin console's open reports list the report",
		openReports.some((openReport) => openReport.subjectId === findingId && openReport.reporter.id === ownerId),
	)
}

// the owner blocks and unblocks a person, and is rejected a block of themselves
async function checkBlock(client: SmokeClient): Promise<void> {
	// a block, then the unblock
	for (const [isBlocked, resultText] of [
		[true, "Blocked."],
		[false, "Unblocked."],
	] as const) {
		const blockResult = await client.callTool({
			name: "block_user",
			arguments: { user_id: blockedUserId, is_blocked: isBlocked },
		})
		check(`/mcp: block_user says ${resultText}`, toResultText(blockResult) === resultText, toResultText(blockResult))
	}

	// a block of oneself
	const selfResult = await client.callTool({ name: "block_user", arguments: { user_id: ownerId, is_blocked: true } })
	check("/mcp: block_user rejects a block of oneself", Boolean(selfResult.isError), toResultText(selfResult))
}

// the owner posts a hot take on the finding and deletes it, and a second delete finds nothing
async function checkHotTakeDelete(client: SmokeClient, findingId: string, label: string): Promise<void> {
	// the hot take, whose id the post names
	const postResult = await client.callTool({
		name: "post_hot_take",
		arguments: { target_kind: "finding", target_id: findingId, body: `${runId} hot take` },
	})
	const commentId = /The hot take's id is ([^.\s]+)\./.exec(toResultText(postResult))?.[1] ?? ""
	check(`${label}: post_hot_take names the hot take's id`, Boolean(commentId), toResultText(postResult))

	// the delete, then a repeat that finds nothing
	const deleteResult = await client.callTool({ name: "delete_hot_take", arguments: { comment_id: commentId } })
	check(`${label}: delete_hot_take deletes the author's hot take`, !deleteResult.isError, toResultText(deleteResult))
	const repeatResult = await client.callTool({ name: "delete_hot_take", arguments: { comment_id: commentId } })
	check(`${label}: a second delete_hot_take finds nothing`, Boolean(repeatResult.isError), toResultText(repeatResult))
}

// the bound route reports and blocks nothing
async function checkBoundRoute(client: SmokeClient, findingId: string): Promise<void> {
	// a report and a block, each named for the account, not the topic
	const accountToolCalls = [
		{ name: "report_content", arguments: { subject_kind: "finding", subject_id: findingId } },
		{ name: "block_user", arguments: { user_id: blockedUserId, is_blocked: true } },
	]
	await checkBoundRejections(client, accountToolCalls, "does nothing")
}
