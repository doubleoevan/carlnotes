// private link payloads stay encrypted until a live Scan claims them for this Topic
import { toCanonicalUrl } from "@carlnotes/contracts/canonicalUrl"
import { personalSourceKinds } from "@carlnotes/contracts/enums"
import { personalSourcesReferenceUrl } from "@carlnotes/contracts/personalSourcesUrls"
import {
	AUTOMATIC_PERSONAL_SOURCE_SCORE_BONUS,
	PERSONAL_SOURCE_SCORE_BONUS,
	type PersonalSourceScoreBonus,
} from "@carlnotes/contracts/sourceScoring"
import { toAuthSecretSignature } from "@carlnotes/server/hmac"
import { and, asc, eq, inArray, isNull, ne, or, type SQL, sql } from "drizzle-orm"
import { type DbHandle, db } from "./index"
import { personalSourcePayloadBytes, readPersonalSourcePayloads } from "./personalSourcePayloads"
import { isPersonalSourcesTopic } from "./personalSourcesAuthority"
import { readyContextFilter } from "./personalSourcesContext"
import { lockPersonalSourcesTopic } from "./personalSourcesLocks"
import { personalSourceEntries, personalSourcesLinks, topicPersonalSourceContexts } from "./schema/personalSources"
import { scans } from "./schema/scans"
import { sources, topics } from "./schema/topics"
import { canRequestTopicScan, toEditableTopicFilter } from "./topicPermissions"

// bound each Source's batch and recover claims after worker loss
const MAX_CLAIMED_LINKS = 1000
type PersonalSourcesLinkCandidate = { id: string; url: string; personalSourceScoreBonus: PersonalSourceScoreBonus }

/**
 * Fingerprints a canonical public URL without storing its plaintext in personal sources metadata.
 */
export function toPersonalSourcesLinkFingerprint(url: string): string {
	return toAuthSecretSignature({
		value: `inbox-link:${toCanonicalUrl(url)}`,
		purpose: "personal sources links",
		encoding: "hex",
	})
}

/**
 * Claims live links for one running Scan and recovers unfinished claims from earlier attempts.
 */
export async function claimPersonalSourcesLinks({
	sourceId,
	scanId,
}: {
	sourceId: string
	scanId: string
}): Promise<PersonalSourcesLinkCandidate[]> {
	return db.transaction(async (transaction) => {
		// verify the Source and Scan still belong to the same Topic
		const [source] = await transaction.select().from(sources).where(eq(sources.id, sourceId))
		if (source?.status !== "ready" || !personalSourceKinds.some((kind) => kind === source.kind)) {
			return []
		}
		const topic = await lockPersonalSourcesTopic(transaction, source.topicId)
		if (
			!topic ||
			!source.personalSourcesUserId ||
			!(await isPersonalSourcesTopic({ userId: source.personalSourcesUserId, topic, transaction }))
		) {
			return []
		}
		const [scan] = await transaction
			.select({ id: scans.id, ownerId: scans.ownerId })
			.from(scans)
			.where(and(eq(scans.id, scanId), eq(scans.topicId, topic.id), eq(scans.status, "running")))
		if (!scan || !(await canRequestTopicScan(scan.ownerId, topic, transaction))) {
			return []
		}

		// a finished Scan or an expired lease releases every unfinished candidate
		const finishedScanIds = transaction.select({ id: scans.id }).from(scans).where(ne(scans.status, "running"))
		const candidates = await readLiveLinks(
			transaction,
			and(
				eq(personalSourceEntries.sourceId, sourceId),
				eq(personalSourceEntries.userId, source.personalSourcesUserId),
				or(
					eq(personalSourcesLinks.state, "pending"),
					and(
						eq(personalSourcesLinks.state, "claimed"),
						or(
							eq(personalSourcesLinks.scanId, scanId),
							isNull(personalSourcesLinks.scanId),
							inArray(personalSourcesLinks.scanId, finishedScanIds),
							sql`${personalSourcesLinks.claimExpiresAt} <= clock_timestamp()`,
						),
					),
				),
			),
		)
		if (candidates.length === 0) {
			return []
		}
		await transaction
			.update(personalSourcesLinks)
			.set({ state: "claimed", scanId, claimExpiresAt: sql`clock_timestamp() + interval '15 minutes'` })
			.where(
				inArray(
					personalSourcesLinks.id,
					candidates.map((candidate) => candidate.id),
				),
			)
		return candidates
	})
}

/**
 * Reloads a Scan’s current claims from retained entries before review.
 */
export function loadClaimedPersonalSourcesLinks({
	topicId,
	scanId,
}: {
	topicId: string
	scanId: string
}): Promise<PersonalSourcesLinkCandidate[]> {
	return readLiveLinks(
		db,
		and(
			eq(personalSourceEntries.topicId, topicId),
			eq(personalSourcesLinks.scanId, scanId),
			eq(personalSourcesLinks.state, "claimed"),
		),
		MAX_CLAIMED_LINKS * 10,
	)
}

/**
 * Records consideration for all live claims of one URL, including duplicates across Personal sources.
 */
export async function considerPersonalSourcesLink({
	topicId,
	scanId,
	url,
	reviewOutcome = "scored",
	reviewReason = null,
}: {
	topicId: string
	scanId: string
	url: string
	reviewOutcome?: "scored" | "rejected"
	reviewReason?: string | null
}): Promise<void> {
	// an entry removed during review cannot be revived by a late outcome
	const liveEntryIds = db
		.select({ id: personalSourceEntries.id })
		.from(personalSourceEntries)
		.where(and(eq(personalSourceEntries.topicId, topicId)))
	await db
		.update(personalSourcesLinks)
		.set({ state: "considered", consideredAt: new Date(), claimExpiresAt: null, reviewOutcome, reviewReason })
		.where(
			and(
				eq(personalSourcesLinks.scanId, scanId),
				eq(personalSourcesLinks.state, "claimed"),
				eq(personalSourcesLinks.fingerprint, toPersonalSourcesLinkFingerprint(url)),
				inArray(personalSourcesLinks.entryId, liveEntryIds),
			),
		)
}

// inspect metadata first, then decrypt only one entry at a time even for large permanent imports
async function readLiveLinks(
	handle: DbHandle,
	filter: SQL | undefined,
	limit = MAX_CLAIMED_LINKS,
): Promise<PersonalSourcesLinkCandidate[]> {
	const links = await handle
		.select({
			id: personalSourcesLinks.id,
			entryId: personalSourcesLinks.entryId,
			bytes: personalSourcePayloadBytes,
			position: personalSourcesLinks.position,
			fingerprint: personalSourcesLinks.fingerprint,
		})
		.from(personalSourcesLinks)
		.innerJoin(personalSourceEntries, eq(personalSourceEntries.id, personalSourcesLinks.entryId))
		.innerJoin(topics, eq(topics.id, personalSourceEntries.topicId))
		.innerJoin(
			topicPersonalSourceContexts,
			and(
				eq(topicPersonalSourceContexts.topicId, personalSourceEntries.topicId),
				eq(topicPersonalSourceContexts.userId, personalSourceEntries.userId),
			),
		)
		.where(and(readyContextFilter, toEditableTopicFilter(personalSourceEntries.userId), filter))
		.orderBy(asc(personalSourceEntries.receivedAt), asc(personalSourceEntries.id), asc(personalSourcesLinks.position))
		.limit(limit)
	const candidates: PersonalSourcesLinkCandidate[] = []
	const linksByEntry = Map.groupBy(links, (link) => link.entryId)
	const entries = Array.from(linksByEntry, ([entryId, group]) => ({ entryId, bytes: group[0]?.bytes ?? 0 }))
	for await (const { entryId, payload } of readPersonalSourcePayloads(handle, entries)) {
		if (!payload) {
			continue
		}
		for (const link of linksByEntry.get(entryId) ?? []) {
			const parsedUrl = personalSourcesReferenceUrl.safeParse(payload.links[link.position])
			if (!parsedUrl.success || toPersonalSourcesLinkFingerprint(parsedUrl.data) !== link.fingerprint) {
				continue
			}
			candidates.push({
				id: link.id,
				url: toCanonicalUrl(parsedUrl.data),
				personalSourceScoreBonus:
					payload.senderKind === "newsletter" || payload.senderKind === "unknown"
						? AUTOMATIC_PERSONAL_SOURCE_SCORE_BONUS
						: PERSONAL_SOURCE_SCORE_BONUS,
			})
		}
	}
	return candidates
}
