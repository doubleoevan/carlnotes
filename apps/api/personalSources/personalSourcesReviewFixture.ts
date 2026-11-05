// retained synthetic development data lets the owner inspect the same states after UI testing
import { connectionPool, type DbTransaction, db } from "@carlnotes/db"
import { toPersonalSourcesLinkFingerprint } from "@carlnotes/db/personalSourcesLinkQueue"
import {
	personalSourceEntries,
	personalSourcesLinks,
	topicPersonalSourceContexts,
} from "@carlnotes/db/schema/personalSources"
import { findings, resources, scans } from "@carlnotes/db/schema/scans"
import { sources, topics } from "@carlnotes/db/schema/topics"
import { users } from "@carlnotes/db/schema/users"
import { encryptPrivateText } from "@carlnotes/server/privateText"
import { eq } from "drizzle-orm"

// this entry cannot write to production or silently choose an account
if (Bun.env.DOPPLER_CONFIG !== "dev" || !Bun.argv[2]) {
	throw new Error("Use seed:personal-sources with an existing development account email")
}
try {
	await seedReviewTopics(Bun.argv[2])
} finally {
	await connectionPool.end()
}

// deterministic identities preserve the user's edits and deletions on repeated seed runs
async function seedReviewTopics(email: string): Promise<void> {
	const [owner] = await db.select({ id: users.id }).from(users).where(eq(users.email, email))
	if (!owner) {
		throw new Error("No matching development account")
	}
	const topicId = `personal-sources-review-${owner.id}`
	const emptyId = `${topicId}-empty`
	const [existing] = await db.select({ id: topics.id }).from(topics).where(eq(topics.id, topicId))
	if (!existing) {
		await db.transaction(async (transaction) => {
			// no scheduled brew, outbound mail, grant, plan change, or model call is part of seeding
			await transaction.insert(topics).values([
				{
					id: topicId,
					ownerId: owner.id,
					name: "Personal sources review · LLM evals",
					prompt: "Synthetic review fixture: methods for evaluating LLM agents and catching drift.",
					visibility: "private",
					frequency: "weekly",
					scheduledDayOfWeek: "sunday",
					scheduledTime: "23:59",
					isPodcastEnabled: false,
					tags: ["review-fixture", "evals"],
				},
				{
					id: emptyId,
					ownerId: owner.id,
					name: "Personal sources review · Empty, ten Sources",
					prompt: "Synthetic full-capacity Topic for first-send and empty-state review.",
					visibility: "private",
					frequency: "weekly",
					scheduledDayOfWeek: "sunday",
					scheduledTime: "23:59",
					isPodcastEnabled: false,
					tags: ["review-fixture"],
				},
			])
			await transaction.insert(topicPersonalSourceContexts).values({
				publicOutputsVersion: 1,
				topicId,
				userId: owner.id,
				revision: 25,
				processedRevision: 25,
				state: "ready",
				includedEntryCount: 25,

				encryptedContext: encryptPrivateText(
					"Synthetic review example: You are building an eval harness and comparing drift detection. You lean toward offline replay sets over live sampling. Open question: how often to refresh the golden set.",
				),
			})
			await seedReviewSources({ transaction, topicId, emptyId, userId: owner.id })
			const now = new Date()
			const urls = [
				"https://example.com/personal-sources-review/kept",
				"https://example.com/personal-sources-review/scored",
				"https://example.com/personal-sources-review/queued",
			]
			await seedReviewEntries({ transaction, topicId, userId: owner.id, now, urls })
			await transaction
				.insert(resources)
				.values({ id: `${topicId}-resource`, url: urls[0] ?? "", kind: "read", title: "Synthetic replay-set Finding" })
				.onConflictDoNothing({ target: resources.url })
			const [resource] = await transaction
				.select({ id: resources.id })
				.from(resources)
				.where(eq(resources.url, urls[0] ?? ""))
			if (!resource) {
				throw new Error("Could not create the synthetic review Resource")
			}
			await transaction.insert(scans).values({
				id: `${topicId}-scan`,
				topicId,
				ownerId: owner.id,
				status: "succeeded",
				finishedAt: now,
				foundCount: 1,
				keptCount: 1,
			})
			await transaction.insert(findings).values({
				id: `${topicId}-finding`,
				topicId,
				resourceId: resource.id,
				scanId: `${topicId}-scan`,
				relevanceScore: 0.9,
				relevanceExplanation:
					"Synthetic Finding for checking navigation from a Personal sources link. No live article was scored.",
			})
		})
	}
	console.log(
		JSON.stringify({
			ownerEmail: email,
			topicPath: `/topics/${topicId}`,
			emptyTopicPath: `/topics/${emptyId}`,
			retained: true,
		}),
	)
}

// give source editing a full fetched set and two registrations in the same verified app group
async function seedReviewSources({
	transaction,
	topicId,
	emptyId,
	userId,
}: {
	transaction: DbTransaction
	topicId: string
	emptyId: string
	userId: string
}): Promise<void> {
	await transaction.insert(sources).values([
		...Array.from({ length: 10 }, (_, index) => ({
			id: `${emptyId}-${index}`,
			topicId: emptyId,
			kind: "url" as const,
			config: { url: `https://example.com/review-source-${index + 1}` },
			status: "ready" as const,
		})),
		...["claude-a", "claude-b", "chatgpt", "email"].map((id) => toReviewSource({ id, topicId, userId })),
	])
}

// create the paged synthetic history without changing real receipt counters or credentials
async function seedReviewEntries({
	transaction,
	topicId,
	userId,
	now,
	urls,
}: {
	transaction: DbTransaction
	topicId: string
	userId: string
	now: Date
	urls: string[]
}): Promise<void> {
	for (let index = 0; index < 25; index += 1) {
		const entryId = `${topicId}-item-${index}`
		await transaction.insert(personalSourceEntries).values(toReviewEntry({ topicId, userId, index, now, urls }))
		if (index === 0) {
			await transaction
				.insert(personalSourcesLinks)
				.values(urls.map((url, position) => toReviewLink({ url, position, entryId, now })))
		}
	}
}

// the saved app domains are synthetic validated-origin fixtures, not claimed OAuth grants
function toReviewSource({
	id,
	topicId,
	userId,
}: {
	id: string
	topicId: string
	userId: string
}): typeof sources.$inferInsert {
	return {
		id: `${topicId}-${id}`,
		topicId,
		kind: id === "email" ? ("email" as const) : ("ai_agent" as const),
		personalSourcesUserId: userId,
		personalSourcesIdentity: id === "email" ? "email" : `oauth:review-${id}`,
		config:
			id === "email"
				? {}
				: {
						delivery: "oauth",
						clientId: `review-${id}`,
						appDomain: id === "chatgpt" ? "chatgpt.com" : "claude.ai",
					},
		status: "ready" as const,
	}
}

// every synthetic status has matching queue evidence
function toReviewLink({
	url,
	position,
	entryId,
	now,
}: {
	url: string
	position: number
	entryId: string
	now: Date
}): typeof personalSourcesLinks.$inferInsert {
	const isScored = position < 2
	return {
		entryId,
		position,
		fingerprint: toPersonalSourcesLinkFingerprint(url),
		state: isScored ? "considered" : "pending",
		reviewOutcome: isScored ? "scored" : null,
		consideredAt: isScored ? now : null,
	}
}

// fictional mail is display data and never claims provider verification or Premium activation
function toReviewEntry({
	topicId,
	userId,
	index,
	now,
	urls,
}: {
	topicId: string
	userId: string
	index: number
	now: Date
	urls: string[]
}): typeof personalSourceEntries.$inferInsert {
	const source = index === 1 ? "email" : index === 2 ? "chatgpt" : index % 2 ? "claude-b" : "claude-a"
	const entryId = `${topicId}-item-${index}`
	const receivedAt = new Date(now.getTime() - index * 3_600_000)
	const sender = source === "email" ? "Newsletter example (synthetic)" : source === "chatgpt" ? "ChatGPT" : "Claude"

	return {
		id: entryId,
		topicId,
		userId,
		sourceId: `${topicId}-${source}`,
		origin: source === "email" ? "email" : "send",
		receivedAt,

		encryptedPayload: encryptPrivateText(
			JSON.stringify({
				title:
					index === 0
						? "Eval drift and replay sets"
						: index === 1
							? "AI engineering weekly · email fixture"
							: `Golden set research ${index + 1}`,
				text: "Synthetic manual-review data. Working on an eval harness for agent outputs. Concluded offline replay sets catch drift more cheaply than live sampling. Open question: how often to refresh the golden set, and whether to weight recent failures.",
				sender,
				senderKind: source === "email" ? "newsletter" : "agent",
				links: index === 0 ? urls : [],
				chatUrl: null,
			}),
		),
	}
}
