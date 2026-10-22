// a Storage kept in memory

/**
 * Returns an empty Storage whose items live in memory until the page unloads.
 */
export function toMemoryStorage(): Storage {
	const items = new Map<string, string>()
	return {
		get length(): number {
			return items.size
		},
		clear: (): void => items.clear(),
		getItem: (key: string): string | null => items.get(key) ?? null,
		key: (index: number): string | null => [...items.keys()][index] ?? null,
		removeItem: (key: string): void => {
			items.delete(key)
		},
		setItem: (key: string, value: string): void => {
			items.set(key, String(value))
		},
	}
}
