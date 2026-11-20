import { afterEach, expect, type Mock, mock, spyOn, test } from "bun:test"
import { restoreConnectionPool, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import * as dailySpendCutoffs from "@carlnotes/db/dailySpendCutoffs"
import * as jobLease from "@carlnotes/db/jobLease"
import * as personalSourcesAuthority from "@carlnotes/db/personalSourcesAuthority"
import { EMBED_MODEL_NAME } from "@carlnotes/db/schema/scans"
import * as litellm from "@carlnotes/models/litellm"
import * as models from "@carlnotes/models/models"
import * as spendReservations from "@carlnotes/models/spendReservations"
import * as monitoring from "@carlnotes/server/monitoring"
import type { LanguageModel } from "ai"
import * as ai from "ai"
import * as topicMemoryClaimReview from "./topicMemoryClaimReview"
import * as topicMemoryCleanup from "./topicMemoryCleanup"
import * as topicMemoryDrafts from "./topicMemoryDrafts"
import * as topicMemoryEmbeddings from "./topicMemoryEmbeddings"
import * as topicMemoryEvidence from "./topicMemoryEvidence"
import * as topicMemoryReconciliation from "./topicMemoryReconciliation"
import { chargeTopicMemorySpend } from "./topicMemorySpend"
import * as topicMemorySubjects from "./topicMemorySubjects"
import * as topicMemoryWrites from "./topicMemoryWrites"
import { TopicMemoryAuthenticationError, TopicMemoryLeaseHeldError, updateTopicMemories } from "./updateTopicMemories"

afterEach(() => {
	mock.restore()
	restoreConnectionPool()
})

// a succeeded Scan that no update has reached, and one public Finding of it
const SCAN = {
	id: "scan-1",
	topicId: "topic-1",
	ownerId: "owner-1",
	startedAt: new Date("2026-11-19T10:00:00Z"),
	topicMemoriesUpdatedAt: null,
	topicMemoriesWrittenAt: null,
	formatVersion: null,
}
const FINDING = { id: "finding-1", title: "A cafe opens", relevanceScore: 0.9, rating: null, description: "A cafe." }

// the calls that cost money or write, which each test counts
type UpdateCalls = {
	loadFindings: Mock<typeof topicMemoryEvidence.loadTopicMemoryFindings>
	reserveSpend: Mock<typeof spendReservations.reserveUserSpend>
	loadKey: Mock<typeof litellm.loadOrProvisionUserLiteLLMKey>
	saveUpdates: Mock<typeof topicMemoryWrites.saveTopicMemoryUpdates>
	embedVectors: Mock<typeof models.embedVectors>
}

// stubs what an update reads before its first model call, and returns the calls that a test counts
function stubUpdate({
	scan = SCAN,
	isLeaseHeld = false,
	isPastCutoff = false,
	isTopicMemoryLimitFilledBySaved = false,
	reservation = { release: mock(async () => {}) } as spendReservations.SpendReservation | "rejected",
}: {
	scan?: Omit<typeof SCAN, "topicMemoriesUpdatedAt"> & { topicMemoriesUpdatedAt: Date | null }
	isLeaseHeld?: boolean
	isPastCutoff?: boolean
	isTopicMemoryLimitFilledBySaved?: boolean
	reservation?: spendReservations.SpendReservation | "rejected"
} = {}): UpdateCalls {
	// the lease runs its task at once, or reports another run's live lease
	spyOn(jobLease, "runWithJobLease").mockImplementation((async ({
		runTask,
	}: jobLease.RunWithJobLeaseOptions<unknown>) =>
		isLeaseHeld ? null : runTask(new AbortController().signal)) as typeof jobLease.runWithJobLease)
	spyOn(topicMemoryEvidence, "loadTopicMemoryScan").mockResolvedValue(
		scan as Awaited<ReturnType<typeof topicMemoryEvidence.loadTopicMemoryScan>>,
	)
	spyOn(personalSourcesAuthority, "hasUnconvertedPersonalSources").mockResolvedValue(false)
	spyOn(dailySpendCutoffs, "isUserPastDailySpendCutoff").mockResolvedValue(isPastCutoff)
	spyOn(topicMemoryCleanup, "isTopicMemoryLimitFilledBySaved").mockResolvedValue(isTopicMemoryLimitFilledBySaved)

	// the paid calls and the write
	return {
		loadFindings: spyOn(topicMemoryEvidence, "loadTopicMemoryFindings").mockResolvedValue([
			FINDING,
		] as unknown as Awaited<ReturnType<typeof topicMemoryEvidence.loadTopicMemoryFindings>>),
		reserveSpend: spyOn(spendReservations, "reserveUserSpend").mockResolvedValue(reservation),
		loadKey: spyOn(litellm, "loadOrProvisionUserLiteLLMKey").mockResolvedValue("sk-owner"),
		saveUpdates: spyOn(topicMemoryWrites, "saveTopicMemoryUpdates").mockResolvedValue(),
		embedVectors: spyOn(models, "embedVectors"),
	}
}

const signal = new AbortController().signal

test("a Topic whose protected topic memories fill its limit marks the Scan updated and pays for nothing", async () => {
	const calls = stubUpdate({ isTopicMemoryLimitFilledBySaved: true })
	expect(await updateTopicMemories("scan-1", signal)).toBe("updated")
	// the Scan's completion is written with no topic memory, and no Finding, reservation, or key was read
	expect(calls.saveUpdates).toHaveBeenCalledTimes(1)
	expect(calls.saveUpdates.mock.calls[0]?.[0]).toMatchObject({ scanId: "scan-1", topicId: "topic-1", writes: [] })
	expect(calls.loadFindings).not.toHaveBeenCalled()
	expect(calls.reserveSpend).not.toHaveBeenCalled()
	expect(calls.loadKey).not.toHaveBeenCalled()
})

test("a Scan that an update already reached is skipped with no model call and no write", async () => {
	const calls = stubUpdate({ scan: { ...SCAN, topicMemoriesUpdatedAt: new Date() } })
	expect(await updateTopicMemories("scan-1", signal)).toBe("skipped")
	expect(calls.loadFindings).not.toHaveBeenCalled()
	expect(calls.reserveSpend).not.toHaveBeenCalled()
	expect(calls.saveUpdates).not.toHaveBeenCalled()
})

test("an update that finds the lease held fails unless the Scan is already updated", async () => {
	// another attempt is still working
	const calls = stubUpdate({ isLeaseHeld: true })
	await expect(updateTopicMemories("scan-1", signal)).rejects.toBeInstanceOf(TopicMemoryLeaseHeldError)
	expect(calls.saveUpdates).not.toHaveBeenCalled()
	mock.restore()

	// the other attempt committed between the lease read and this one
	stubUpdate({ isLeaseHeld: true, scan: { ...SCAN, topicMemoriesUpdatedAt: new Date() } })
	expect(await updateTopicMemories("scan-1", signal)).toBe("skipped")
})

test("a free owner past the daily cutoff pauses the update before any Finding is read", async () => {
	const calls = stubUpdate({ isPastCutoff: true })
	expect(await updateTopicMemories("scan-1", signal)).toBe("paused")
	expect(calls.loadFindings).not.toHaveBeenCalled()
	expect(calls.saveUpdates).not.toHaveBeenCalled()
})

test("a rejected reservation pauses the update without a key, a model call, or a write", async () => {
	const calls = stubUpdate({ reservation: "rejected" })
	expect(await updateTopicMemories("scan-1", signal)).toBe("paused")
	expect(calls.reserveSpend.mock.calls[0]?.[0]).toMatchObject({ userId: "owner-1", kind: "topicMemories" })
	expect(calls.loadKey).not.toHaveBeenCalled()
	expect(calls.embedVectors).not.toHaveBeenCalled()
	expect(calls.saveUpdates).not.toHaveBeenCalled()
})

test("a key that LiteLLM rejects fails the update with a safe error and releases the reservation once", async () => {
	// the first model call of the update returns a 401 with the provider's own words
	const release = mock(async () => {})
	const calls = stubUpdate({ reservation: { release } })
	stubConnectionPool(() => [])
	calls.embedVectors.mockRejectedValue(Object.assign(new Error("Invalid key sk-owner"), { statusCode: 401 }))
	const failure = await updateTopicMemories("scan-1", signal).catch((error: unknown) => error)
	// the thrown error names the status and nothing from the provider
	expect(failure).toBeInstanceOf(TopicMemoryAuthenticationError)
	expect((failure as Error).message).not.toContain("sk-owner")
	expect(release).toHaveBeenCalledTimes(1)
	expect(calls.saveUpdates).not.toHaveBeenCalled()
})

// the backfill builds topic memories that nobody asked for, so its owner is never reserved against, paused, or billed
test("the backfill's update runs on the platform's key, whatever its owner has spent", async () => {
	// the owner is past the daily cutoff, and a reservation against them would be rejected
	const calls = stubUpdate({ isPastCutoff: true, reservation: "rejected" })
	stubConnectionPool(() => [])
	calls.embedVectors.mockRejectedValue(Object.assign(new Error("Invalid key"), { statusCode: 401 }))
	const failure = await updateTopicMemories("scan-1", signal, { isPlatformBilled: true }).catch(
		(error: unknown) => error,
	)

	// the update reached its first model call with no key of the owner's and no reservation
	expect(calls.reserveSpend).not.toHaveBeenCalled()
	expect(calls.loadKey).not.toHaveBeenCalled()
	expect(calls.embedVectors.mock.calls[0]?.[1]).toMatchObject({ litellmApiKey: undefined })

	// the platform's rejected key ends the update at once, with no owner's key to read again
	expect(failure).toBeInstanceOf(TopicMemoryAuthenticationError)
})

test("a 401 on a key that was replaced while the update ran is worth another attempt", async () => {
	// the update starts on the old key, and the owner holds a new one by the time LiteLLM rejects it
	const release = mock(async () => {})
	const calls = stubUpdate({ reservation: { release } })
	calls.loadKey.mockResolvedValueOnce("sk-old").mockResolvedValue("sk-new")
	stubConnectionPool(() => [])
	calls.embedVectors.mockRejectedValue(Object.assign(new Error("Invalid key sk-old"), { statusCode: 401 }))
	const failure = await updateTopicMemories("scan-1", signal).catch((error: unknown) => error)

	// the failure is not the one that ends the update for good, and it names neither key
	expect(failure).toBeInstanceOf(Error)
	expect(failure).not.toBeInstanceOf(TopicMemoryAuthenticationError)
	expect((failure as Error).message).toBe("The Topic owner's key changed during the topic memory update")
	expect(release).toHaveBeenCalledTimes(1)
})

test("an update past its spend limit starts no further model call and still commits", async () => {
	// eight unrelated Findings draft in two batches of four, and each extraction costs more than the whole limit
	const findings = Array.from({ length: 8 }, (_, index) => ({
		...FINDING,
		id: `finding-${index}`,
		embedding: Array.from({ length: 8 }, (_, position) => Number(position === index)),
		embeddingModel: EMBED_MODEL_NAME,
	}))
	const calls = stubUpdate()
	calls.loadFindings.mockResolvedValue(
		findings as unknown as Awaited<ReturnType<typeof topicMemoryEvidence.loadTopicMemoryFindings>>,
	)
	spyOn(models, "cheapModel").mockReturnValue({} as LanguageModel)
	spyOn(models, "scoreModel").mockReturnValue({} as LanguageModel)
	const generate = spyOn(ai, "generateText").mockResolvedValue({
		output: { facts: [] },
		usage: { totalTokens: 1_000_000 },
	} as Awaited<ReturnType<typeof ai.generateText>>)
	const report = spyOn(monitoring, "reportError").mockImplementation(() => {})
	spyOn(console, "warn").mockImplementation(() => {})
	const queries = stubConnectionPool(() => [])
	expect(await updateTopicMemories("scan-1", signal)).toBe("updated")

	// the first batch's four calls ran, and neither the second batch nor a premium retry started
	expect(generate).toHaveBeenCalledTimes(4)
	expect(calls.embedVectors).not.toHaveBeenCalled()

	// the Scan row took the spend in one write, the update still committed, and the stop was reported
	const spendWrites = queries.filter(({ text }) => text.startsWith('update "scans" set "cost"'))
	expect(spendWrites).toHaveLength(1)
	expect(spendWrites[0]?.values).toContain("0.800000")
	expect(calls.saveUpdates).toHaveBeenCalledTimes(1)
	expect(calls.saveUpdates.mock.calls[0]?.[0]).toMatchObject({ scanId: "scan-1", writes: [] })
	expect(report.mock.calls[0]?.[2]).toEqual({ scanId: "scan-1", spentDollars: "0.8000" })
})

test("the match's spend reaches the Scan row before the write marks the Scan updated", async () => {
	// one Finding with a current vector, no drafted claim, and a match that costs five cents
	const calls = stubUpdate()
	calls.loadFindings.mockResolvedValue([
		{ ...FINDING, embedding: [1, 0], embeddingModel: EMBED_MODEL_NAME },
	] as unknown as Awaited<ReturnType<typeof topicMemoryEvidence.loadTopicMemoryFindings>>)
	spyOn(topicMemorySubjects, "loadTopicMemorySubjects").mockResolvedValue([])
	spyOn(topicMemoryReconciliation, "loadTopicMemoryReconciliationJournal").mockResolvedValue(undefined)

	// the drafts, the claim check, and the embedding cost nothing
	spyOn(topicMemoryDrafts, "draftTopicMemoriesFromFindings").mockResolvedValue([])
	spyOn(topicMemoryClaimReview, "validateTopicMemoryClaims").mockResolvedValue({
		writes: [],
		counts: { checked: 0, split: 0, rejected: 0 },
	})
	spyOn(topicMemoryEmbeddings, "embedTopicMemoryClaims").mockResolvedValue([])

	// only the match charges the spend
	spyOn(topicMemoryReconciliation, "reconcileTopicMemoryClaims").mockImplementation(async ({ spend }) => {
		chargeTopicMemorySpend(spend, 0.05)
		return []
	})

	// the values of the Scan's spend writes so far
	const queries = stubConnectionPool(() => [])
	const toSpendWrites = (): string[] =>
		queries
			.filter(({ text }) => text.startsWith('update "scans" set "cost"'))
			.flatMap(({ values }) => values.map(String))

	// read them at the moment the completion write starts
	let spendWritesBeforeCompletion: string[] = []
	calls.saveUpdates.mockImplementation(async () => {
		spendWritesBeforeCompletion = toSpendWrites()
	})

	// the update commits with the match's five cents already on the Scan row
	expect(await updateTopicMemories("scan-1", signal)).toBe("updated")
	expect(spendWritesBeforeCompletion).toContain("0.050000")
})
