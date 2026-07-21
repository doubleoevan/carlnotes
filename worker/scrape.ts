// scrape a page's full content to Markdown through the Firecrawl API. a raw fetch keyed by FIRECRAWL_API_KEY, with no SDK
const FIRECRAWL_ENDPOINT = "https://api.firecrawl.dev/v1/scrape"
// scraping a live page is slower than a feed fetch, so allow a longer timeout
const FETCH_TIMEOUT_MS = 30_000

// scrape one url to Markdown via Firecrawl. a missing key or failed scrape throws, and curation falls back to the Resource's native snippet
export async function fetchContent(url: string): Promise<string> {
	// Firecrawl requires a key. throw when it isn't set so curation can fall back to the snippet
	const apiKey = Bun.env.FIRECRAWL_API_KEY
	if (!apiKey) {
		throw new Error("FIRECRAWL_API_KEY is not set")
	}

	// request only the main-content Markdown of the page, bounded by the fetch timeout
	const response = await fetch(FIRECRAWL_ENDPOINT, {
		method: "POST",
		headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
		body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true }),
		signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
	})

	// a failed scrape throws an error. curation catches it and scores the snippet instead
	if (!response.ok) {
		throw new Error(`firecrawl scrape ${url} returned ${response.status}`)
	}

	// Firecrawl wraps the page under data.markdown. an empty or whitespace body means the scrape failed, so throw
	const payload = (await response.json()) as { data?: { markdown?: string } }
	const markdown = payload.data?.markdown ?? ""
	if (!markdown.trim()) {
		throw new Error(`firecrawl scrape ${url} returned no content`)
	}
	return markdown
}
