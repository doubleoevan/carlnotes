// real database and route checks keep shared Topic contributions private to each sender
import { db } from "@carlnotes/db"
import { isAllowed } from "@carlnotes/db/authorization"
import { loadPersonalSourcesEntries } from "@carlnotes/db/personalSourceEntries"
import { loadTopicPersonalSources } from "@carlnotes/db/personalSources"
import {
	commitPersonalSourcesContext,
	loadPersonalSourcesContextSnapshot,
	loadPersonalSourcesReviewContexts,
	type PersonalSourcesReviewContext,
} from "@carlnotes/db/personalSourcesContext"
import { deletePersonalSourceEntry } from "@carlnotes/db/personalSourcesLifecycle"
import { receivePersonalSourceEntry } from "@carlnotes/db/personalSourcesReceive"
import { personalSourceEntries } from "@carlnotes/db/schema/personalSources"
import { findings, resources, scans } from "@carlnotes/db/schema/scans"
import { teamMembers, teams } from "@carlnotes/db/schema/teams"
import { sources, topics } from "@carlnotes/db/schema/topics"
import { users } from "@carlnotes/db/schema/users"
import { upsertFinding } from "@carlnotes/pipeline/review/saveFinding"
import { and, eq } from "drizzle-orm"
import { Hono } from "hono"
import type { SessionUser } from "../auth"
import type { AppEnv } from "../currentUser"
import { personalSourcesRoute } from "./personalSourcesRoute"
import {
	checkPersonalSources,
	personalSourcesSmokeDelivery,
	seedPersonalSourcesTopic,
} from "./personalSourcesSmokeFixtures"

// fixture identifiers stay separate from the user's retained manual-review Topics
type SharingFixture = { topicId: string; ownerId: string; senderId: string; adminId: string; teamId: string }
const PUBLIC_EXPLANATION = "This linked page describes independent promise failures and concurrent work."

/**
 * Checks sender isolation across shared Topics, visibility changes, ownership, deletion, and lost edit access.
 */
export async function checkPersonalSourcesSharing(): Promise<void> {
	const fixture = await seedSharingFixture()
	try {
		await receiveSharedEntries(fixture)
		await checkSenderSourceForeignKey(fixture)
		const contexts = await settleSharedContexts(fixture.topicId)
		await checkSharedReads({ fixture, contexts })
		await checkSharedAnnotations({ fixture, contexts })
	} finally {
		await db.delete(teams).where(eq(teams.id, fixture.teamId))
	}
}

// two active owning Team members share edit authority, while the administrator sends nothing
async function seedSharingFixture(): Promise<SharingFixture> {
	const owner = await seedPersonalSourcesTopic("sharing-owner")
	const sender = await seedPersonalSourcesTopic("sharing-sender")
	const admin = await seedPersonalSourcesTopic("sharing-admin")
	const teamId = crypto.randomUUID()
	await db.insert(teams).values({ id: teamId, name: `Personal sources smoke ${teamId}` })
	await db.insert(teamMembers).values([
		{ teamId, userId: owner.userId, role: "leader" },
		{ teamId, userId: sender.userId, role: "member" },
	])
	await db.update(users).set({ role: "admin" }).where(eq(users.id, admin.userId))
	await db.update(topics).set({ teamId, visibility: "public" }).where(eq(topics.id, owner.topicId))
	await db.insert(sources).values(
		Array.from({ length: 10 }, () => ({
			topicId: owner.topicId,
			kind: "rss" as const,
			config: {},
			status: "ready" as const,
		})),
	)
	return { topicId: owner.topicId, ownerId: owner.userId, senderId: sender.userId, adminId: admin.userId, teamId }
}

// the same verified client creates a separate receiving Source for each sender on a full Topic
async function receiveSharedEntries(fixture: SharingFixture): Promise<void> {
	for (const userId of [fixture.ownerId, fixture.senderId]) {
		const delivery = personalSourcesSmokeDelivery({ userId, topicId: fixture.topicId }, "shared-send", "same-client")
		const receipt = await receivePersonalSourceEntry({
			...delivery,
			payload: { ...delivery.payload, title: userId, text: `Private text for ${userId}` },
		})
		checkPersonalSources(
			"an owning Team editor sends to a public Topic with ten fetched Sources",
			receipt.status === "accepted",
		)
		const metadata = await loadTopicPersonalSources({ userId, topicId: fixture.topicId })
		checkPersonalSources(
			"each sender sees one own Source, one item, and ten counted Sources",
			metadata?.sourceCount === 10 && metadata.sources.length === 1 && metadata.sources[0]?.entryCount === 1,
		)
	}
}

// the database rejects a cross-sender Source even when both senders have valid Topic contexts
async function checkSenderSourceForeignKey(fixture: SharingFixture): Promise<void> {
	const [entry] = await db
		.select()
		.from(personalSourceEntries)
		.where(and(eq(personalSourceEntries.topicId, fixture.topicId), eq(personalSourceEntries.userId, fixture.ownerId)))
	if (!entry) {
		throw new Error("Shared Source fixture missing")
	}
	let constraintCode: string | undefined
	try {
		await db.insert(personalSourceEntries).values({ ...entry, id: crypto.randomUUID(), userId: fixture.senderId })
	} catch (error) {
		const cause = error instanceof Error && error.cause ? error.cause : error
		constraintCode = (cause as { code?: string }).code
	}
	checkPersonalSources("Source identity cannot cross senders on the same Topic", constraintCode === "23503")
}

// commit synthetic summaries through the production revision and authority checks without model spend
async function settleSharedContexts(topicId: string): Promise<PersonalSourcesReviewContext[]> {
	for (let i = 0; i < 2; i++) {
		const snapshot = await loadPersonalSourcesContextSnapshot(topicId)
		if (
			!snapshot ||
			!(await commitPersonalSourcesContext({ snapshot, context: `Private summary for ${snapshot.userId}`, cost: 0 }))
		) {
			throw new Error("Shared context fixture did not settle")
		}
	}
	const contexts = await loadPersonalSourcesReviewContexts(topicId)
	checkPersonalSources("scoring reads both current senders independently", contexts.length === 2)
	return contexts
}

// real routes authenticate a fixture session and retain production authorization and response serialization
async function readPrivateRoute({
	userId,
	topicId,
	suffix,
}: {
	userId: string
	topicId: string
	suffix: string
}): Promise<unknown> {
	const app = new Hono<AppEnv>()
		.use("*", async (context, next) => {
			context.set("user", { id: userId } as SessionUser)
			await next()
		})
		.route("/", personalSourcesRoute)
	const response = await app.request(`/topics/${topicId}/personal-sources/${suffix}`)
	checkPersonalSources("private responses use no-store", response.headers.get("cache-control") === "no-store")
	return response.json()
}

// the owner and administrator can edit but cannot read another sender's private text
async function checkSharedReads({
	fixture,
	contexts,
}: {
	fixture: SharingFixture
	contexts: PersonalSourcesReviewContext[]
}): Promise<void> {
	for (const userId of [fixture.ownerId, fixture.senderId, fixture.adminId]) {
		const entries = (await readPrivateRoute({ userId, topicId: fixture.topicId, suffix: "entries" })) as {
			entries: { text: string }[]
		}
		const context = (await readPrivateRoute({ userId, topicId: fixture.topicId, suffix: "context" })) as {
			text: string | null
		}
		const expectedCount = userId === fixture.adminId ? 0 : 1
		checkPersonalSources(
			"private items and summaries belong only to the authenticated sender",
			entries.entries.length === expectedCount &&
				entries.entries.every((entry) => entry.text === `Private text for ${userId}`) &&
				context.text === (contexts.find((entry) => entry.userId === userId)?.text ?? null),
		)
	}
}

// both private annotations accompany one page-only public Finding in the same commit
async function checkSharedAnnotations({
	fixture,
	contexts,
}: {
	fixture: SharingFixture
	contexts: PersonalSourcesReviewContext[]
}): Promise<void> {
	const [resource] = await db
		.insert(resources)
		.values({
			url: `https://example.com/personal-sources-smoke/${crypto.randomUUID()}`,
			kind: "read",
			content: PUBLIC_EXPLANATION,
		})
		.returning()
	const [scan] = await db
		.insert(scans)
		.values({ topicId: fixture.topicId, ownerId: fixture.ownerId, status: "succeeded" })
		.returning()
	if (!resource || !scan) {
		throw new Error("Shared Finding fixture missing")
	}
	const review = {
		scan,
		topicId: fixture.topicId,
		resource,
		score: 0.9,
		relevanceExplanation: PUBLIC_EXPLANATION,
		topicContextHash: "synthetic",
		isFromCustomSource: false,
		personalSources: contexts,
		annotations: contexts.map((context) => ({
			userId: context.userId,
			text: `Private annotation for ${context.userId}`,
		})),
	}
	try {
		await upsertFinding(review)
		const [finding] = await db.select().from(findings).where(eq(findings.resourceId, resource.id))
		if (!finding) {
			throw new Error("Shared Finding was not saved")
		}
		checkPersonalSources(
			"shared Finding stores only page-derived public text",
			finding.relevanceExplanation === PUBLIC_EXPLANATION,
		)
		for (const visibility of ["public", "private", "invite"] as const) {
			await db.update(topics).set({ visibility, ownerId: fixture.senderId }).where(eq(topics.id, fixture.topicId))
			await checkAnnotationReaders({ fixture, findingId: finding.id })
		}
		await db.update(topics).set({ visibility: "public" }).where(eq(topics.id, fixture.topicId))
		await db
			.update(teamMembers)
			.set({ isActive: false })
			.where(and(eq(teamMembers.teamId, fixture.teamId), eq(teamMembers.userId, fixture.ownerId)))
		const [currentTopic] = await db.select().from(topics).where(eq(topics.id, fixture.topicId))
		checkPersonalSources(
			"former editors retain their own history but cannot send",
			Boolean(
				currentTopic &&
					(await isAllowed(fixture.ownerId, "personalSources:read", currentTopic)) &&
					!(await isAllowed(fixture.ownerId, "personalSources:send", currentTopic)),
			),
		)
		const retainedEntries = (await readPrivateRoute({
			userId: fixture.ownerId,
			topicId: fixture.topicId,
			suffix: "entries",
		})) as { entries: unknown[] }
		checkPersonalSources("former editors can open their retained item page", retainedEntries.entries.length === 1)
		let isStaleCommitRejected = false
		try {
			await upsertFinding(review)
		} catch {
			isStaleCommitRejected = true
		}
		checkPersonalSources("a stale or unauthorized sender context cannot restore annotations", isStaleCommitRejected)
		await checkSharedDeletion({ fixture, findingId: finding.id })
	} finally {
		await db.delete(resources).where(eq(resources.id, resource.id))
	}
}

// each sender reads their own annotation after visibility and ownership changes
async function checkAnnotationReaders({
	fixture,
	findingId,
}: {
	fixture: SharingFixture
	findingId: string
}): Promise<void> {
	for (const userId of [fixture.ownerId, fixture.senderId, fixture.adminId]) {
		const annotation = (await readPrivateRoute({
			userId,
			topicId: fixture.topicId,
			suffix: `findings/${findingId}/annotation`,
		})) as { text: string | null }
		checkPersonalSources(
			"Topic ownership and admin access never transfer private annotations",
			annotation.text === (userId === fixture.adminId ? null : `Private annotation for ${userId}`),
		)
	}
}

// deleting another sender's id is a no-op, and deleting one's own item clears only one's derived text
async function checkSharedDeletion({
	fixture,
	findingId,
}: {
	fixture: SharingFixture
	findingId: string
}): Promise<void> {
	const page = await loadPersonalSourcesEntries({ userId: fixture.ownerId, topicId: fixture.topicId })
	if (!page || page === "invalid_cursor" || !page.entries[0]) {
		throw new Error("Shared deletion fixture missing")
	}
	const entryId = page.entries[0].id
	await deletePersonalSourceEntry({ userId: fixture.senderId, topicId: fixture.topicId, entryId })
	const retained = await loadPersonalSourcesEntries({ userId: fixture.ownerId, topicId: fixture.topicId })
	checkPersonalSources(
		"a Topic owner cannot delete another sender's item",
		retained !== null && retained !== "invalid_cursor" && retained.entries.length === 1,
	)
	await deletePersonalSourceEntry({ userId: fixture.ownerId, topicId: fixture.topicId, entryId })
	for (const userId of [fixture.ownerId, fixture.senderId]) {
		const annotation = (await readPrivateRoute({
			userId,
			topicId: fixture.topicId,
			suffix: `findings/${findingId}/annotation`,
		})) as { text: string | null }
		checkPersonalSources(
			"sender deletion clears only that sender's annotation",
			annotation.text === (userId === fixture.ownerId ? null : `Private annotation for ${userId}`),
		)
	}
}
