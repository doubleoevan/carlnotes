// live database transactions prove multi-Topic sends share one charge and fail atomically
import { PERSONAL_SOURCES_DAILY_SEND_LIMIT } from "@carlnotes/contracts/personalSources"
import { db } from "@carlnotes/db"
import { deletePersonalSourceEntry } from "@carlnotes/db/personalSourcesLifecycle"
import { readPersonalSourcesAllowance } from "@carlnotes/db/personalSourcesQuota"
import { receivePersonalSourcesSend } from "@carlnotes/db/personalSourcesSend"
import {
	personalSourceEntries,
	personalSourcesDailyCounts,
	personalSourcesDeliveries,
} from "@carlnotes/db/schema/personalSources"
import { topics } from "@carlnotes/db/schema/topics"
import { count, eq } from "drizzle-orm"
import {
	checkPersonalSources,
	personalSourcesSmokeDelivery,
	seedPersonalSourcesTopic,
} from "./personalSourcesSmokeFixtures"

/**
 * Exercises multi-Topic quota accounting, full rollback, retries, and removed-entry tombstones.
 */
export async function checkPersonalSourcesMultiSend(): Promise<void> {
	// one free account starts one send away from its daily limit
	const owner = await seedPersonalSourcesTopic("multi-send", "free")
	const secondId = `${owner.topicId}-2`
	await db.insert(topics).values({
		id: secondId,
		ownerId: owner.userId,
		name: "Second destination",
		prompt: "Coffee equipment",
		visibility: "public",
	})
	const allowance = await readPersonalSourcesAllowance({ userId: owner.userId })
	const limit = PERSONAL_SOURCES_DAILY_SEND_LIMIT
	await db
		.insert(personalSourcesDailyCounts)
		.values({ userId: owner.userId, day: allowance.day, kind: "send", acceptedCount: limit - 1 })
	const delivery = personalSourcesSmokeDelivery(owner, "multi-retry")
	const topicIds = [owner.topicId, secondId]
	const failed = await receivePersonalSourcesSend({ ...delivery, topicIds: [...topicIds, "zz-missing"] })
	checkPersonalSources("a refused final destination rolls back the batch", failed.status === "not_found")
	checkPersonalSources(
		"rollback leaves no entries or retry confirmations",
		(
			await db
				.select({ count: count() })
				.from(personalSourceEntries)
				.where(eq(personalSourceEntries.userId, owner.userId))
		)[0]?.count === 0 &&
			(
				await db
					.select({ count: count() })
					.from(personalSourcesDeliveries)
					.where(eq(personalSourcesDeliveries.userId, owner.userId))
			)[0]?.count === 0,
	)
	checkPersonalSources(
		"rollback leaves the final send allowance available",
		(await readPersonalSourcesAllowance({ userId: owner.userId })).isAvailable,
	)

	// two concurrent multi-Topic requests compete for the same last slot
	const results = await Promise.all([
		receivePersonalSourcesSend({ ...delivery, topicIds }),
		receivePersonalSourcesSend({ ...delivery, requestId: "competing-send", topicIds }),
	])
	const accepted = results.find((result) => result.status === "accepted")
	checkPersonalSources(
		"one multi-Topic send wins the final slot",
		results.filter((result) => result.status === "accepted").length === 1 &&
			results.filter((result) => result.status === "quota").length === 1,
	)
	if (accepted?.status !== "accepted") {
		throw new Error("Missing batch confirmation")
	}
	checkPersonalSources(
		"one acceptance stores both destinations",
		accepted.confirmations?.length === 2 &&
			(
				await db
					.select({ count: count() })
					.from(personalSourceEntries)
					.where(eq(personalSourceEntries.userId, owner.userId))
			)[0]?.count === 2,
	)
	checkPersonalSources(
		"both destinations count as one accepted send",
		(await db.select().from(personalSourcesDailyCounts).where(eq(personalSourcesDailyCounts.userId, owner.userId)))[0]
			?.acceptedCount === limit,
	)
	const acceptedDelivery = {
		...delivery,
		requestId: results[0]?.status === "accepted" ? delivery.requestId : "competing-send",
	}
	const replay = await receivePersonalSourcesSend({ ...acceptedDelivery, topicIds: [...topicIds].reverse() })
	checkPersonalSources(
		"reordered retry returns the identical batch confirmation after quota is exhausted",
		JSON.stringify(replay) === JSON.stringify(accepted),
	)
	checkPersonalSources(
		"changed destinations cannot reuse the request id",
		(await receivePersonalSourcesSend({ ...acceptedDelivery, topicIds: [owner.topicId] })).status === "conflict",
	)

	// deleting one destination never lets a retry reconstruct that item or refund a send
	await deletePersonalSourceEntry({ ...owner, entryId: accepted.entryId })
	const afterDelete = await receivePersonalSourcesSend({ ...acceptedDelivery, topicIds })
	checkPersonalSources(
		"retry after item deletion cannot resurrect the batch",
		afterDelete.status === "conflict" && afterDelete.reason === "removed",
	)
	checkPersonalSources(
		"deletion preserves the one consumed charge",
		!(await readPersonalSourcesAllowance({ userId: owner.userId })).isAvailable,
	)
}
