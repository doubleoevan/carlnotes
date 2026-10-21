// the fetch stubs the client tests share: one response for every fetch, or a request that never reaches the server

/**
 * Stubs every fetch with one response.
 */
export function stubFetch(response: Response): void {
	globalThis.fetch = (async () => response) as unknown as typeof fetch
}

/**
 * Stubs every fetch with a request that never reaches the server.
 */
export function stubFailingFetch(): void {
	globalThis.fetch = (async () => {
		throw new TypeError("network down")
	}) as unknown as typeof fetch
}
