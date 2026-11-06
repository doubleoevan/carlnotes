// one isolated development confirmation runs through real model and Temporal services
import { withTimeLimit } from "@carlnotes/contracts/time"
import { db } from "@carlnotes/db"
import { loadPersonalSourcesEntries } from "@carlnotes/db/personalSourceEntries"
import { readPersonalSourcesContext } from "@carlnotes/db/personalSourcesContext"
import { deletePersonalSourceEntry } from "@carlnotes/db/personalSourcesLifecycle"
import { receivePersonalSourceEntry } from "@carlnotes/db/personalSourcesReceive"
import { loadPendingPersonalSourcesTopicIds } from "@carlnotes/db/personalSourcesWork"
import { personalSourcesSummarySpends } from "@carlnotes/db/schema/personalSources"
import { findings, resources, scans } from "@carlnotes/db/schema/scans"
import { topics } from "@carlnotes/db/schema/topics"
import { users } from "@carlnotes/db/schema/users"
import { deleteUserLiteLLMKey, loadOrProvisionUserLiteLLMKey } from "@carlnotes/models/litellm"
import { buildTopicScanContext } from "@carlnotes/pipeline/attach"
import { summarizePersonalSourcesContext } from "@carlnotes/pipeline/personalSources/summarize"
import { notifyPersonalSourcesChanged } from "@carlnotes/pipeline/personalSources/work"
import { startTopicScan, stopTopicScan } from "@carlnotes/pipeline/scan"
import { eq } from "drizzle-orm"
import {
	checkPersonalSources,
	personalSourcesSmokeDelivery,
	seedPersonalSourcesTopic,
} from "./personalSourcesSmokeFixtures"

// the public page supplies the Resource text. the private canary appears only in the received item
const PUBLIC_URL = "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise"
const PRIVATE_CANARY = "personal-sources-live-private-canary-741"

/**
 * Checks real confirmation, recovery, owner billing, Scan reuse, and deletion with a single public URL.
 */
export async function checkPersonalSourcesLiveFlow(): Promise<void> {
	// seed no followers, so the fixture has no email or push recipients
	const topic = await seedPersonalSourcesTopic("live-flow", "premium", new Date())
	await db
		.update(topics)
		.set({
			name: "JavaScript promises",
			prompt: "Understand JavaScript Promise composition, concurrency and rejection handling.",
			isPodcastEnabled: false,
		})
		.where(eq(topics.id, topic.topicId))
	const delivery = personalSourcesSmokeDelivery(topic, "live-confirmation")
	const result = await receivePersonalSourceEntry({
		...delivery,
		payload: {
			...delivery.payload,
			title: "Promise concurrency",
			text: `I am implementing concurrent JavaScript requests. I concluded Promise.all rejects when one input rejects. Open question: when should I prefer allSettled? Private fixture marker: ${PRIVATE_CANARY}.`,
			links: [PUBLIC_URL],
		},
	})
	if (result.status !== "accepted") {
		throw new Error(`Live confirmation was ${result.status}`)
	}
	try {
		// a missed notification stays discoverable, and a missing key makes no model attempt
		checkPersonalSources(
			"live confirmation survives a missed workflow notification",
			(await loadPendingPersonalSourcesTopicIds()).includes(topic.topicId),
		)
		checkPersonalSources(
			"live summarization without an owner key waits",
			(await summarizePersonalSourcesContext(topic.topicId)) === "retry",
		)
		await loadOrProvisionUserLiteLLMKey(topic.userId)
		await notifyPersonalSourcesChanged(topic.topicId)
		await waitForReadyContext(topic)
		await checkLiveScan(topic)

		// delete only this smoke's item. the separate owner review Topics remain untouched
		const before = await db.select({ id: findings.id }).from(findings).where(eq(findings.topicId, topic.topicId))
		await deletePersonalSourceEntry({ ...topic, entryId: result.entryId })
		checkPersonalSources(
			"live deletion immediately clears the scoring context",
			(await readPersonalSourcesContext({ topicId: topic.topicId, userId: topic.userId })) === null,
		)
		await notifyPersonalSourcesChanged(topic.topicId)
		const after = await db.select({ id: findings.id }).from(findings).where(eq(findings.topicId, topic.topicId))
		checkPersonalSources(
			"live deletion retains the Scan's Findings",
			before.length > 0 && JSON.stringify(before) === JSON.stringify(after),
		)
		console.log("Retained live-flow Topic:", topic.topicId)
	} finally {
		// retire the synthetic model credential even when the diagnostic data is kept
		try {
			const stopped = await stopTopicScan(topic.topicId)
			if (stopped.status === "cancelled") {
				await withTimeLimit({
					work: stopped.whenStopped(),
					timeLimitMs: 30_000,
					toError: () => new Error("Live Scan cancellation exceeded thirty seconds"),
				})
			}
		} finally {
			await deleteUserLiteLLMKey(topic.userId)
			await db.update(users).set({ litellmVirtualKey: null }).where(eq(users.id, topic.userId))
		}
	}
}

// wait for the real workflow's debounce and model result under a bounded deadline
async function waitForReadyContext({ topicId, userId }: { topicId: string; userId: string }): Promise<void> {
	const deadline = Date.now() + 180_000
	while (Date.now() < deadline) {
		const context = await readPersonalSourcesContext({ topicId, userId })
		if (context) {
			checkPersonalSources("real workflow commits bounded model context", context.length <= 8000)
			return
		}
		await Bun.sleep(1000)
	}
	throw new Error("Live summarization did not settle within three minutes")
}

// ordinary review reuses the summary while search and global Resource storage exclude private text
async function checkLiveScan(topic: { topicId: string; userId: string }): Promise<void> {
	const before = await readSummarySpends(topic.topicId)
	checkPersonalSources(
		"real summarization bills one successful owner attempt",
		before.length === 1 &&
			before[0]?.state === "succeeded" &&
			before[0]?.userId === topic.userId &&
			Number(before[0]?.cost) > 0,
	)
	const search = await buildTopicScanContext({ topicId: topic.topicId, purpose: "search" })
	checkPersonalSources(
		"real search context excludes the private canary",
		!JSON.stringify(search).includes(PRIVATE_CANARY) && !search.personalSourcesVersions,
	)
	const started = await startTopicScan(topic.topicId, topic.userId, "manual")
	if (started.status !== "started") {
		throw new Error("Live Scan did not start")
	}
	await withTimeLimit({
		work: started.whenFinished(),
		timeLimitMs: 300_000,
		toError: () => new Error("Live Scan exceeded five minutes"),
	})
	const [scan] = await db.select({ status: scans.status }).from(scans).where(eq(scans.id, started.scan.id))
	checkPersonalSources("real Scan completes through Temporal", scan?.status === "succeeded")
	const page = await loadPersonalSourcesEntries(topic)
	checkPersonalSources(
		"real Scan records the received link outcome",
		Boolean(page && page !== "invalid_cursor" && page.entries[0]?.linkOutcomes[0]?.status !== "queued"),
	)
	const resourceRows = await db
		.select({ title: resources.title, snippet: resources.snippet, content: resources.content })
		.from(resources)
		.where(eq(resources.url, PUBLIC_URL))
	checkPersonalSources(
		"global Resource fields contain no private canary",
		resourceRows.length === 1 && !JSON.stringify(resourceRows).includes(PRIVATE_CANARY),
	)
	checkPersonalSources(
		"the Scan does not charge another summarization",
		JSON.stringify(before) === JSON.stringify(await readSummarySpends(topic.topicId)),
	)
}

// compare recorded attempts without reading encrypted content or model credentials
async function readSummarySpends(
	topicId: string,
): Promise<Pick<typeof personalSourcesSummarySpends.$inferSelect, "userId" | "state" | "cost">[]> {
	return await db
		.select({
			userId: personalSourcesSummarySpends.userId,
			state: personalSourcesSummarySpends.state,
			cost: personalSourcesSummarySpends.cost,
		})
		.from(personalSourcesSummarySpends)
		.where(eq(personalSourcesSummarySpends.topicId, topicId))
}
