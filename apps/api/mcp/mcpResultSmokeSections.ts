// measured result bounds and complete cursor traversal against controlled, live MCP fixtures
import { expectedFindings, largeTopicId, searchQuery } from "./mcpDirectorySmokeFixtures"
import { check, toClient, toResultJson } from "./mcpSmokeFixtures"
import { MCP_PAGE_MAX_CHARS, MCP_PAGE_SIZE, type McpFinding, type McpPage } from "./results"
import { toResultText } from "./toolTestFixtures"

// the serialized page envelope may use this many characters beyond its packed item budget
const RESULT_MAX_CHARS = MCP_PAGE_MAX_CHARS + 1024
export type SmokeClient = ReturnType<typeof toClient>["client"]

/** Traverses both endpoint feeds and two search pages, checking text and structured representations separately. */
export async function checkResultBounds(accessToken: string): Promise<void> {
	for (const path of ["/mcp", `/mcp/t/${largeTopicId}`]) {
		const { client, transport } = toClient(path, accessToken)
		try {
			await client.connect(transport)
			await checkFeedPages(client, path)
			await checkSearchPages(client, path)
		} finally {
			// release the SDK transport after each endpoint
			await client.close()
		}
	}
}

// follow a bounded number of opaque cursors and compare every ID and full explanation with the seeded values
async function checkFeedPages(client: SmokeClient, path: string): Promise<void> {
	// collect whole findings and reject a repeated cursor within a bounded traversal
	const found: typeof expectedFindings = []
	const cursors = new Set<string>()
	let cursor: string | null = null
	let reachedCharacterBoundary = false
	for (let index = 0; index < expectedFindings.length; index += 1) {
		const result = await client.callTool({
			name: "read_topic_feed",
			arguments: { topic_id: largeTopicId, cursor: cursor ?? undefined },
		})
		const page = toResultJson<McpPage<McpFinding>>(result)
		checkFeedPage({ path, result, page, index })

		// remember character-limited pages and collect their complete findings
		if (page.nextCursor && page.items.length < MCP_PAGE_SIZE) {
			reachedCharacterBoundary = true
		}
		found.push(...page.items.map(({ findingId, relevanceExplanation }) => ({ findingId, relevanceExplanation })))
		cursor = page.nextCursor

		// finish at a null cursor and stop a looping cursor before another request
		if (!cursor) {
			break
		}

		// reject a repeated cursor before the next read
		check(`${path}: cursor progresses`, !cursors.has(cursor))
		if (cursors.has(cursor)) {
			break
		}
		cursors.add(cursor)
	}

	// require both packing boundaries and every finding exactly once
	check(`${path}: feed reaches the character boundary`, reachedCharacterBoundary)
	check(
		`${path}: every complete finding appears once and traversal terminates`,
		cursor === null && JSON.stringify(found) === JSON.stringify(expectedFindings),
	)
}

// measure a feed's packed items, complete representations, and first-page count boundary
function checkFeedPage({
	path,
	result,
	page,
	index,
}: {
	path: string
	result: Awaited<ReturnType<SmokeClient["callTool"]>>
	page: McpPage<McpFinding>
	index: number
}): void {
	checkPageBounds(`${path} feed page ${index + 1}`, result)
	check(
		`${path}: packed items stay within the budget`,
		page.items.reduce((sum, item) => sum + JSON.stringify(item).length, 0) <= MCP_PAGE_MAX_CHARS,
	)
	check(`${path}: feed count bound`, page.items.length > 0 && page.items.length <= MCP_PAGE_SIZE)
	if (index === 0) {
		check(`${path}: first page reaches the twenty-item boundary`, page.items.length === MCP_PAGE_SIZE)
	}
}

// fifty profiles and one topic exercise both the maximum search page and its continuation
async function checkSearchPages(client: SmokeClient, path: string): Promise<void> {
	// collect both pages to catch missing or duplicated rows
	const ids: string[] = []
	for (const pageNumber of [1, 2]) {
		const result = await client.callTool({
			name: "search",
			arguments: { q: searchQuery, kinds: ["users", "topics"], size: 50, page: pageNumber },
		})
		checkPageBounds(`${path} search page ${pageNumber}`, result)

		// require the requested page number, total, and exact number of rows
		const page = result.structuredContent as {
			rows: { id: string }[]
			rowCount: number
			page: number
			pageCount: number
		}
		check(
			`${path}: search page ${pageNumber} count and continuation`,
			page.rows.length === (pageNumber === 1 ? 50 : 1) &&
				page.rowCount === 51 &&
				page.pageCount === 2 &&
				page.page === pageNumber,
		)
		ids.push(...page.rows.map((row) => row.id))
	}
	check(`${path}: search returns all fifty-one results once`, ids.length === 51 && new Set(ids).size === 51)
}

/** Reports model-visible representations and MCP view metadata separately. */
export function checkPageBounds(label: string, result: Awaited<ReturnType<SmokeClient["callTool"]>>): void {
	const textChars = toResultText(result).length
	const structuredChars = JSON.stringify(result.structuredContent ?? null).length
	const metaChars = JSON.stringify(result._meta ?? null).length
	check(
		`${label}: text and structured bounds`,
		!result.isError && textChars <= RESULT_MAX_CHARS && structuredChars <= RESULT_MAX_CHARS,
		{ textChars, structuredChars },
	)
	console.log(
		`      ${label}: text=${textChars}, structured=${structuredChars}, combined=${textChars + structuredChars}, mcpViewMeta=${metaChars}`,
	)
}
