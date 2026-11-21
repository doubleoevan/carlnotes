// query budgets for the daily spend cutoffs: the manual scan route's cutoff reads stay inside their maximum, and a
// topic create returns without waiting for its first scan's cutoff read
import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test"
import { updateTopicPayload } from "@carlnotes/contracts/topicPayloads"
import {
	FREE_USER_ACCESS_ROW,
	PLUS_USER_ACCESS_ROW,
	restoreConnectionPool,
	type SentQuery,
	toTableRow,
} from "@carlnotes/db/connectionPoolStub"
import * as dailySpendCutoffs from "@carlnotes/db/dailySpendCutoffs"
import * as monthlyBudgetCutoffs from "@carlnotes/db/monthlyBudgetCutoffs"
import * as redis from "@carlnotes/db/redis"
import { runWithRequestMemo } from "@carlnotes/db/requestMemo"
import { scans } from "@carlnotes/db/schema/scans"
import { topics } from "@carlnotes/db/schema/topics"
import * as viewerCounts from "@carlnotes/db/viewerCounts"
import * as litellm from "@carlnotes/models/litellm"
import * as scan from "@carlnotes/pipeline/scan"
import * as screen from "@carlnotes/pipeline/screen"
import * as topicImageRenders from "@carlnotes/pipeline/topicImages/topicImageRenders"
import * as analytics from "@carlnotes/server/analytics"
import { apiRoute } from "./api"
import * as authorization from "./authorization"
import * as inviteEmails from "./invite/emails"
import * as userInvites from "./invite/userInvites"
import { endQueryBudgetTest, startQueryBudgetTest, stubBudgetConnectionPool } from "./queryBudgetsTestFixtures"
import { signInAs } from "./testSession"
import * as promptVersions from "./topic/promptVersions"
import * as saveHelpers from "./topic/saveHelpers"
import { createTopic } from "./topic/saveTopic"
import * as saveTopicGate from "./topic/saveTopicGate"
import * as topicIndexing from "./topic/topicIndexing"
import { isTopicWithOwnerRead, toTopicWithOwnerRow } from "./topic/topicTestFixtures"

// the queries the stubbed connection pool was sent, from the start of the test
let sentQueries: SentQuery[] = []

// one Redis with the related reads' centroid stored and one stubbed connection pool per test, with the console quiet
beforeEach(() => {
	sentQueries = startQueryBudgetTest()
})

// everything back after each test
afterEach(() => {
	endQueryBudgetTest()
	mock.restore()
})

// the most daily spend cutoff reads a manual scan request may send: none for a paid user or on a cache hit, and on a
// miss the settings row and the eight free-plan spend sums
const MAX_DAILY_SPEND_CUTOFF_CACHE_MISS_QUERIES = 9

// a topic owned by the signed-in user, so the manual scan gate allows the scan
const OWNED_TOPIC_ROW = toTableRow(topics, { id: "topic-1", ownerId: "user-1", name: "Agents", visibility: "public" })

// the reads that only the daily spend cutoffs send: the settings row, the free-plan spend sums, and the Topic's waiting
// first scan
function isDailySpendCutoffRead(sentQuery: SentQuery): boolean {
	return (
		sentQuery.text.includes('"spend_control_settings"') ||
		sentQuery.text.includes(`"users"."role" <> 'admin'`) ||
		sentQuery.text.includes('"earlier_scans"')
	)
}

// stub the connection pool with the owned topic and the given access row, a key under its budget, and a scan start that succeeds
function stubManualScanRequest(accessRow: unknown[]): void {
	restoreConnectionPool()
	sentQueries = stubBudgetConnectionPool((sentQuery) => {
		if (isTopicWithOwnerRead(sentQuery.text)) {
			return [toTopicWithOwnerRow(OWNED_TOPIC_ROW, "user-1", accessRow)]
		}

		// the topic alone, and the user's access
		if (sentQuery.text.includes('from "topics" where "topics"."id" = $1')) {
			return [OWNED_TOPIC_ROW]
		}
		return sentQuery.text.includes('"admin_blocked_at" from "users"') ? [accessRow] : []
	})

	// a key under its budget and a scan start that succeeds
	spyOn(litellm, "isUserLiteLLMKeyBudgetExhausted").mockResolvedValue(false)
	spyOn(scan, "startTopicScan").mockResolvedValue({
		status: "started",
		scan: { id: "scan-1" } as never,
		whenFinished: async () => {},
	})
}

// request a manual scan of topic-1 as user-1, with the request memo open, and return how many cutoff reads it sent
async function requestManualScan(): Promise<{ response: Response; dailySpendCutoffQueryCount: number }> {
	signInAs("user-1")
	const queryCountBefore = sentQueries.length
	const response = await runWithRequestMemo(() => apiRoute.request("/api/topics/topic-1/scan", { method: "POST" }))
	const dailySpendCutoffQueryCount = sentQueries.slice(queryCountBefore).filter(isDailySpendCutoffRead).length
	return { response, dailySpendCutoffQueryCount }
}

// a paid user's manual scan reads nothing the daily spend cutoffs add
test("a paid user's manual scan sends no daily spend cutoff read", async () => {
	stubManualScanRequest(PLUS_USER_ACCESS_ROW)
	const { response, dailySpendCutoffQueryCount } = await requestManualScan()
	expect(response.status).toBe(200)
	expect(dailySpendCutoffQueryCount).toBe(0)
})

// a free user's manual scan reads the settings and the spend sums on a miss, and nothing on a hit
test("a free user's manual scan sends the cutoff reads on a cache miss and none on a hit", async () => {
	stubManualScanRequest(FREE_USER_ACCESS_ROW)
	const cacheMissRequest = await requestManualScan()
	const cacheHitRequest = await requestManualScan()

	// the miss reads within the maximum, and the hit reads nothing
	expect(cacheMissRequest.response.status).toBe(200)
	expect(cacheMissRequest.dailySpendCutoffQueryCount).toBeGreaterThan(0)
	expect(cacheMissRequest.dailySpendCutoffQueryCount).toBeLessThanOrEqual(MAX_DAILY_SPEND_CUTOFF_CACHE_MISS_QUERIES)
	expect(cacheHitRequest.dailySpendCutoffQueryCount).toBe(0)
})

// a bypassed cache sends the cutoff reads again on the second request
test("a bypassed cache fails the manual scan's cache hit maximum", async () => {
	stubManualScanRequest(FREE_USER_ACCESS_ROW)
	spyOn(redis, "cacheJson").mockImplementation(({ load }) => load())
	await requestManualScan()
	const secondRequest = await requestManualScan()
	expect(secondRequest.dailySpendCutoffQueryCount).toBeGreaterThan(0)
})

// the new topic's row and its first scan's row, as the create's inserts return them
const CREATED_TOPIC_ROW = toTableRow(topics, { id: "topic-2", ownerId: "user-1", name: "Agents", visibility: "public" })
const FIRST_SCAN_ROW = toTableRow(scans, { id: "scan-2", topicId: "topic-2", ownerId: "user-1", status: "running" })

// stub every step of a topic create around its writes, and the first scan's budget reads, all passing
function stubTopicCreate(): void {
	restoreConnectionPool()
	sentQueries = stubBudgetConnectionPool((sentQuery) => {
		if (sentQuery.text.startsWith('insert into "topics"')) {
			return [CREATED_TOPIC_ROW]
		}
		return sentQuery.text.startsWith('insert into "scans"') ? [FIRST_SCAN_ROW] : []
	})

	// the gates and checks before the writes
	spyOn(authorization, "isAllowed").mockResolvedValue(true)
	spyOn(authorization, "topicsRemaining").mockResolvedValue(5)
	spyOn(saveHelpers, "authorizeNewDailyTopic").mockResolvedValue(null)
	spyOn(saveTopicGate, "toTopicSaveRejection").mockResolvedValue(null)
	spyOn(userInvites, "checkTopicInvitees").mockResolvedValue({
		status: "ok",
		invitedUserIdByEmail: new Map(),
		newInvites: [],
		reinvitedEmails: [],
	})
	spyOn(promptVersions, "savePromptVersion").mockResolvedValue(undefined as never)

	// the work that follows the response
	spyOn(topicImageRenders, "startTopicImageRender").mockResolvedValue(undefined as never)
	spyOn(viewerCounts, "addViewer").mockResolvedValue(undefined)
	spyOn(inviteEmails, "startInviteEmails").mockImplementation(() => {})
	spyOn(topicIndexing, "notifyIndexNowOfTopicChange").mockImplementation(() => {})
	spyOn(analytics, "trackEvent").mockImplementation(() => {})

	// the first scan's budget reads, all under their limits, and the source screens
	spyOn(litellm, "isUserLiteLLMKeyBudgetExhausted").mockResolvedValue(false)
	spyOn(authorization, "isMonthlySpendExhausted").mockResolvedValue(false)
	spyOn(monthlyBudgetCutoffs, "isMonthlyBudgetCutoffPassed").mockResolvedValue(false)
	spyOn(screen, "screenPendingSources").mockResolvedValue(undefined)
}

// a topic create returns while its first scan's daily spend cutoff read is still open
test("a topic create returns without waiting for the first scan's daily spend cutoff read", async () => {
	stubTopicCreate()
	const firstScanWaitingRead = Promise.withResolvers<boolean>()
	const isFirstScanWaitingSpy = spyOn(dailySpendCutoffs, "isFirstScanWaiting").mockReturnValue(
		firstScanWaitingRead.promise,
	)

	// the create resolves before the cutoff read does
	const topicDraft = updateTopicPayload.parse({
		name: "Agents",
		prompt: "agents",
		tags: [],
		frequency: "daily",
		scheduledTime: "09:00",
		scheduledDayOfWeek: "monday",
		visibility: "public",
		maxTopicFindings: 10,
		inviteEmails: [],
		sources: [],
	})
	const createTopicResult = await runWithRequestMemo(() => createTopic("user-1", topicDraft, {} as never))
	expect(createTopicResult.status).toBe("created")

	// the first scan still reads the cutoff after the create returned, and its waiting row starts the screens alone
	for (let i = 0; i < 50 && isFirstScanWaitingSpy.mock.calls.length === 0; i++) {
		await Bun.sleep(1)
	}
	expect(isFirstScanWaitingSpy).toHaveBeenCalledWith("user-1")
	firstScanWaitingRead.resolve(true)
	await Bun.sleep(1)
	expect(screen.screenPendingSources).toHaveBeenCalledWith("topic-2")
})
