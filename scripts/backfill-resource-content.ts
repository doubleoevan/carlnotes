// one-time backfill: move existing resources.content from postgres into object storage.
// idempotent — a resource that already has a content_key is skipped, so it can be re-run.
// run under doppler after the migration: doppler run -- bun scripts/backfill-resource-content.ts
import { and, eq, isNotNull, isNull } from "drizzle-orm"
import { db } from "../db"
import { resources } from "../db/schema"
import { uploadResourceContent } from "../worker/store"

// upload the content of each resource that has no key yet and write its key and size, reporting progress
async function backfill(): Promise<void> {
	// select resources that still have inline content but no object-storage key yet
	const rows = await db
		.select({ id: resources.id, content: resources.content })
		.from(resources)
		.where(and(isNotNull(resources.content), isNull(resources.contentKey)))
	console.log(`backfilling ${rows.length} resources`)

	// upload each row's content and set its key
	let done = 0
	for (const row of rows) {
		// skip a row with no content to upload
		if (!row.content) {
			continue
		}

		// upload the content, then record its content key and size in bytes on the row
		try {
			const storedContent = await uploadResourceContent(row.id, row.content)
			await db
				.update(resources)
				.set({ contentKey: storedContent.contentKey, contentBytes: storedContent.bytes })
				.where(eq(resources.id, row.id))
			// count the successful backfill
			done++
		} catch (error) {
			// one bad row is logged and skipped, so the whole run isn't lost
			console.error(`backfill failed for resource ${row.id}`, error)
		}
	}
	console.log(`backfilled ${done}/${rows.length} resources`)
}

await backfill()
process.exit(0)
