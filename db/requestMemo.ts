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
 * Outside a request, every call runs the read.
 */
export function memoizeInRequest<Value>(key: string, read: () => Promise<Value>): Promise<Value> {
	// outside a request, such as in the worker, every call reads
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
