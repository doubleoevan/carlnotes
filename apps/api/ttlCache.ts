// a read kept in module scope for a while, so the requests inside that window share one read

/**
 * Returns a loader that keeps what the read returns for ttlMs from the read's start,
 * so every call inside that window shares one read, including one still running.
 * A read that fails is not kept, and the next call reads again.
 */
export function cacheForTtl<Value>(read: () => Promise<Value>, ttlMs: number): () => Promise<Value> {
	let cachedRead: { value: Promise<Value>; startedAt: number } | null = null
	return () => {
		// the cached read while it is fresh, including one still running
		if (cachedRead && Date.now() - cachedRead.startedAt < ttlMs) {
			return cachedRead.value
		}

		// a new read, cached from its start
		const startedRead = { value: read(), startedAt: Date.now() }
		cachedRead = startedRead

		// a failed read is dropped, unless a newer read already replaced it, so the next call reads again
		startedRead.value.catch(() => {
			if (cachedRead === startedRead) {
				cachedRead = null
			}
		})
		return startedRead.value
	}
}
