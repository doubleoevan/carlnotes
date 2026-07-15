// the Firecrawl seam: scrape a url's full page content to markdown, keyed by FIRECRAWL_API_KEY (raw fetch, no SDK) — the substrate curation scores against
const FIRECRAWL_ENDPOINT = "https://api.firecrawl.dev/v1/scrape"
// scraping a live page is slower than a feed fetch, so allow a longer timeout
const FETCH_TIMEOUT_MS = 30_000

// scrape one url to markdown via Firecrawl; a missing key or non-ok response throws so curation falls back to the Resource's native snippet
export async function fetchContent(url: string): Promise<string> {
	// Firecrawl requires a key — unset means curation cannot fetch, so throw and let the caller fall back to the snippet
	const apiKey = Bun.env.FIRECRAWL_API_KEY
	if (!apiKey) {
		throw new Error("FIRECRAWL_API_KEY is not set")
	}
	// request just the main-content markdown of the page, bounded by the fetch timeout
	const response = await fetch(FIRECRAWL_ENDPOINT, {
		method: "POST",
		headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
		body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true }),
		signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
	})
	// a non-ok scrape degrades only this Resource (the caller falls back to the snippet)
	if (!response.ok) {
		throw new Error(`firecrawl scrape ${url} returned ${response.status}`)
	}
	// Firecrawl wraps the page under data.markdown; missing content is an empty string, not an error
	const payload = (await response.json()) as { data?: { markdown?: string } }
	return payload.data?.markdown ?? ""
}
