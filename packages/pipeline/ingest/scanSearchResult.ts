import { db } from "@carlnotes/db"
import { scanSearchResults } from "@carlnotes/db/schema/scans"
import { reportError } from "@carlnotes/server/monitoring"
import { eq } from "drizzle-orm"
import { type IngestResult, PaidSourceError } from "./ingester"

/** A Temporal retry reuses the first attempt's public Resources and spend. */
export async function searchOncePerScan(scanId: string, search: () => Promise<IngestResult>): Promise<IngestResult> {
	// Reserve the Scan before either paid provider can receive a request.
	const claimed = await db
		.insert(scanSearchResults)
		.values({ scanId })
		.onConflictDoNothing()
		.returning({ id: scanSearchResults.scanId })
	// A competing attempt can replay only a completed outcome.
	const sameScan = eq(scanSearchResults.scanId, scanId)
	if (!claimed.length) {
		const [saved] = await db.select({ result: scanSearchResults.result }).from(scanSearchResults).where(sameScan)
		if (!saved?.result) {
			throw new Error("The Scan already started its web search and has no saved results to replay.")
		}
		if (saved.result.error) {
			throw new PaidSourceError(saved.result.error, saved.result.costDollars)
		}
		return saved.result
	}

	// A claim survives worker interruption so another attempt cannot spend the allowance again.
	let result: IngestResult
	try {
		result = await search()
	} catch (error) {
		const costDollars = error instanceof PaidSourceError ? error.costDollars : 0
		await db
			.update(scanSearchResults)
			.set({ result: { resources: [], costDollars, error: "The Scan's web search failed." } })
			.where(sameScan)
			.catch((cause: unknown) => reportError(cause, "database", { scanId, operation: "save-search-failure" }))
		throw error
	}
	// Cache only public result fields and spend, including expanded playlist items.
	const resources = result.resources.map(({ url, kind, title, snippet, durationSeconds }) => ({
		url,
		kind,
		title,
		snippet,
		durationSeconds,
	}))
	await db
		.update(scanSearchResults)
		.set({ result: { resources, costDollars: result.costDollars } })
		.where(sameScan)
		.catch((cause: unknown) => {
			reportError(cause, "database", { scanId, operation: "save-search-result" })
			throw new PaidSourceError("The Scan could not save its paid web search results.", result.costDollars)
		})
	return result
}
