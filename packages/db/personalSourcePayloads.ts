// bound the ciphertext read at once while retaining the caller's newest-first or queue order
import { and, inArray, type SQL, sql } from "drizzle-orm"
import type { DbHandle } from "./index"
import { decryptPersonalSourceEntry } from "./personalSourcesLifecycle"
import { personalSourceEntries } from "./schema/personalSources"

export const PERSONAL_SOURCE_READ_BYTES = 2 * 1024 * 1024
export const personalSourcePayloadBytes = sql<number>`octet_length(${personalSourceEntries.encryptedPayload})`.mapWith(
	Number,
)

/**
 * Streams decrypted entries in size-bounded batches. An oversized transcript gets a batch to itself.
 */
export async function* readPersonalSourcePayloads(
	handle: DbHandle,
	entries: { entryId: string; bytes: number }[],
	filter?: SQL,
): AsyncGenerator<{ entryId: string; payload: ReturnType<typeof decryptPersonalSourceEntry> }> {
	for (const ids of payloadBatches(entries)) {
		// the query can return a different order or fewer rows after a concurrent deletion
		const rows = await handle
			.select({ id: personalSourceEntries.id, payload: personalSourceEntries.encryptedPayload })
			.from(personalSourceEntries)
			.where(and(inArray(personalSourceEntries.id, ids), filter))
		const ciphertext = new Map(rows.map(({ id, payload }) => [id, payload]))
		for (const entryId of ids) {
			const encrypted = ciphertext.get(entryId)
			yield { entryId, payload: encrypted ? decryptPersonalSourceEntry(encrypted) : null }
		}
	}
}

// split on both transfer size and row count, preserving the input order across batches
function* payloadBatches(entries: { entryId: string; bytes: number }[]): Generator<string[]> {
	let ids: string[] = []
	let bytes = 0
	for (const entry of entries) {
		if (ids.length === 200 || (ids.length > 0 && bytes + entry.bytes > PERSONAL_SOURCE_READ_BYTES)) {
			yield ids
			ids = []
			bytes = 0
		}
		ids.push(entry.entryId)
		bytes += entry.bytes
	}
	if (ids.length) {
		yield ids
	}
}
