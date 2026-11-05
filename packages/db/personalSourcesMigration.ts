// preserve old private-inflected outputs before making Topic sharing available
import { encryptPrivateText } from "@carlnotes/server/privateText"
import { and, eq, gte, isNull, or, sql } from "drizzle-orm"
import { type DbTransaction, db } from "./index"
import { lockPersonalSourcesTopic } from "./personalSourcesLocks"
import {
	findingPersonalAnnotations,
	personalSourcesLegacyOutputs,
	topicPersonalSourceContexts,
} from "./schema/personalSources"
import { findings, scans } from "./schema/scans"
import { sources, topics } from "./schema/topics"

/**
 * Preserves original senders and quarantines old generated text before releasing legacy privacy guards.
 */
export async function migratePersonalSourcesPrivacy(): Promise<void> {
	// assign legacy Sources to their original Topic owner before ownership can change
	await db
		.update(sources)
		.set({ personalSourcesUserId: sql`${topics.ownerId}` })
		.from(topics)
		.where(
			and(
				eq(sources.topicId, topics.id),
				isNull(sources.personalSourcesUserId),
				sql`${sources.personalSourcesIdentity} is not null`,
			),
		)
	const contexts = await db
		.select()
		.from(topicPersonalSourceContexts)
		.where(eq(topicPersonalSourceContexts.publicOutputsVersion, 0))
		.orderBy(topicPersonalSourceContexts.topicId, topicPersonalSourceContexts.userId)
	for (const context of contexts) {
		await db.transaction(async (transaction) => {
			// hold the same lock that guards visibility, receipt, and Finding publication
			await lockPersonalSourcesTopic(transaction, context.topicId)
			const [current] = await transaction
				.select()
				.from(topicPersonalSourceContexts)
				.where(
					and(
						eq(topicPersonalSourceContexts.topicId, context.topicId),
						eq(topicPersonalSourceContexts.userId, context.userId),
						eq(topicPersonalSourceContexts.publicOutputsVersion, 0),
					),
				)
			if (!current) {
				return
			}
			await preserveLegacyFindings(transaction, current)
			await preserveLegacyScanReports(transaction, current)
			await transaction
				.update(topicPersonalSourceContexts)
				.set({ publicOutputsVersion: 1 })
				.where(
					and(
						eq(topicPersonalSourceContexts.topicId, context.topicId),
						eq(topicPersonalSourceContexts.userId, context.userId),
					),
				)
		})
	}
}

// keep the old note private and let the next Scan regenerate its public explanation
async function preserveLegacyFindings(
	transaction: DbTransaction,
	context: typeof topicPersonalSourceContexts.$inferSelect,
): Promise<void> {
	const rows = await transaction
		.select({ finding: findings })
		.from(findings)
		.where(and(eq(findings.topicId, context.topicId), gte(findings.updatedAt, context.activatedAt)))
	for (const { finding } of rows) {
		if (finding.relevanceExplanation) {
			const encryptedText = encryptPrivateText(finding.relevanceExplanation)
			await transaction
				.insert(personalSourcesLegacyOutputs)
				.values({
					topicId: context.topicId,
					userId: context.userId,
					kind: "finding",
					referenceId: finding.id,
					encryptedText,
				})
				.onConflictDoNothing()
			await transaction
				.insert(findingPersonalAnnotations)
				.values({ findingId: finding.id, topicId: context.topicId, userId: context.userId, encryptedText })
				.onConflictDoNothing()
		}
		await transaction
			.update(findings)
			.set({ relevanceExplanation: "", reviewedContextHash: null })
			.where(eq(findings.id, finding.id))
	}
}

// retain historical reports encrypted while removing them from shared report readers
async function preserveLegacyScanReports(
	transaction: DbTransaction,
	context: typeof topicPersonalSourceContexts.$inferSelect,
): Promise<void> {
	const rows = await transaction
		.select({ id: scans.id, text: scans.scanSummary })
		.from(scans)
		.where(
			and(
				eq(scans.topicId, context.topicId),
				or(
					gte(scans.startedAt, context.activatedAt),
					gte(scans.finishedAt, context.activatedAt),
					isNull(scans.finishedAt),
				),
			),
		)
	for (const scan of rows) {
		if (!scan.text) {
			continue
		}
		await transaction
			.insert(personalSourcesLegacyOutputs)
			.values({
				topicId: context.topicId,
				userId: context.userId,
				kind: "scan",
				referenceId: scan.id,
				encryptedText: encryptPrivateText(scan.text),
			})
			.onConflictDoNothing()
		await transaction.update(scans).set({ scanSummary: null }).where(eq(scans.id, scan.id))
	}
}
