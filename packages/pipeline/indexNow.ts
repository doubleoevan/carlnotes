// the IndexNow endpoint a changed page is reported to, and how long one notification may take
const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow"
const INDEXNOW_TIMEOUT_MS = 5_000

/**
 * Tells IndexNow these pages changed. Nothing is sent without a key, and a rejected or slow request is only logged.
 */
export async function notifyIndexNow(urls: string[]): Promise<void> {
	// skip without a key or without a url to report
	const indexNowKey = Bun.env.INDEXNOW_KEY
	if (!indexNowKey || urls.length === 0) {
		return
	}

	try {
		// post every url with the key, the host, and the key file's address at the first url's origin. every url is
		// on the same host, and IndexNow reads the key back from that key file
		const { host, origin } = new URL(urls[0] as string)
		const response = await fetch(INDEXNOW_ENDPOINT, {
			method: "POST",
			headers: { "content-type": "application/json; charset=utf-8" },
			body: JSON.stringify({ host, key: indexNowKey, keyLocation: `${origin}/indexnow.txt`, urlList: urls }),
			signal: AbortSignal.timeout(INDEXNOW_TIMEOUT_MS),
		})
		if (!response.ok) {
			console.warn("indexnow rejected the notification", { status: response.status, urls })
		}
	} catch (error) {
		console.warn("indexnow notification failed", { urls, error })
	}
}
