import { db } from "@carlnotes/db"
import { scans } from "@carlnotes/db/schema/scans"
import { eq, sql } from "drizzle-orm"

/** Records each paid call, including drafts that cannot be applied on this attempt. */
export async function recordTopicMemorySpend(scanId: string, dollars: number): Promise<void> {
	if (dollars <= 0) {
		return
	}

	// increment total and stage spend atomically across concurrent model calls
	const amount = dollars.toFixed(6)
	await db
		.update(scans)
		.set({
			cost: sql`${scans.cost} + ${amount}::numeric`,
			stageCosts: sql`jsonb_set(${scans.stageCosts}, '{topicMemories}',
			to_jsonb(coalesce((${scans.stageCosts}->>'topicMemories')::numeric, 0) + ${amount}::numeric))`,
		})
		.where(eq(scans.id, scanId))
}
