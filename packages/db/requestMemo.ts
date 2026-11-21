// the reads one request repeats, such as the user's access row and each topic role, kept in the request's async context
import { AsyncLocalStorage } from "node:async_hooks"

// the running request's reads by key, each a promise its concurrent and later callers share
const requestMemoStore = new AsyncLocalStorage<Map<string, Promise<unknown>>>()

/**
 * Runs a request with its own memo, which starts empty and is dropped with the request.
 */
export function runWithRequestMemo<Result>(runRequest: () => Result): Result {
	return requestMemoStore.run(new Map(), runRequest)
}

/**
 * Returns the running request's read for a key, starting the read on the first call,
 * so every call in the request shares one read.
 * Outside a memo, every call runs the read.
 */
export function memoizeInRequest<Value>(key: string, read: () => Promise<Value>): Promise<Value> {
	// outside a memo, every call reads
	const requestMemo = requestMemoStore.getStore()
	if (!requestMemo) {
		return read()
	}

	// the read already started for this key, or a new one kept for the rest of the request
	const memoizedRead = requestMemo.get(key) as Promise<Value> | undefined
	if (memoizedRead) {
		return memoizedRead
	}
	const startedRead = read()
	requestMemo.set(key, startedRead)
	return startedRead
}

/**
 * Forgets every read the running request has kept, so its next read of any key goes to the database.
 */
export function clearRequestMemo(): void {
	requestMemoStore.getStore()?.clear()
}

// the rows a request that only reads has loaded by their kind and id, each a promise of the row or undefined, which
// its later reads share
const rowMemoStore = new AsyncLocalStorage<Map<string, Promise<unknown>>>()

/**
 * Runs a request that only reads with its own memo of rows by id, which starts empty and is dropped with the request.
 * Nothing in the request writes, so a row it loaded once holds for the rest of it.
 */
export function runWithRowMemo<Result>(readRows: () => Promise<Result>): Promise<Result> {
	return rowMemoStore.run(new Map(), readRows)
}

/**
 * Returns the rows of these ids by id, reading in one read only the ids that the running row memo has not read under
 * this kind yet, so every caller of a kind must read the same rows. An id the read found nothing for is left out.
 * Outside a row memo, every call reads every id.
 */
export async function memoizeRowsById<Value>(
	rowKind: string,
	ids: readonly string[],
	readMissing: (missingIds: string[]) => Promise<Map<string, Value>>,
): Promise<Map<string, Value>> {
	// outside a row memo, every id is read
	const rowMemo = rowMemoStore.getStore()
	if (!rowMemo) {
		return readMissing([...new Set(ids)])
	}

	// one read of the ids no earlier call read, which each of them shares
	const missingIds = [...new Set(ids)].filter((id) => !rowMemo.has(`${rowKind}:${id}`))
	if (missingIds.length > 0) {
		const startedRead = readMissing(missingIds)
		for (const missingId of missingIds) {
			rowMemo.set(
				`${rowKind}:${missingId}`,
				startedRead.then((valueById) => valueById.get(missingId)),
			)
		}
	}

	// every id's row, from this read or an earlier one
	const rows = await Promise.all(ids.map((id) => rowMemo.get(`${rowKind}:${id}`) as Promise<Value | undefined>))
	return new Map(ids.flatMap((id, i) => (rows[i] === undefined ? [] : [[id, rows[i] as Value]])))
}
