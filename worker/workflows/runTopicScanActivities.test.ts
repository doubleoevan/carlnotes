// scan activity tests: the ingest stage runs no Source for a Scan that is already marked failed
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { ApplicationFailure } from "@temporalio/activity"
import { getTableColumns } from "drizzle-orm"
import { connectionPool } from "../../db"
import { scans } from "../../db/schema"
import * as ingest from "../ingest"
import * as litellm from "../litellm"
import { ingestForScan } from "./runTopicScanActivities"

// the connection pool's own query, put back after each test along with the spies
const originalConnectionPoolQuery = connectionPool.query
afterEach(() => {
	connectionPool.query = originalConnectionPoolQuery
	mock.restore()
})

// the ingest stage throws the Scan's own failure reason as a failure that Temporal does not retry
test("a Scan that is already marked failed runs no Source and keeps its failure reason", async () => {
	// a failed scan row with its failure reason, as the connection pool returns the row for every select
	const scanValues: Record<string, unknown> = {
		id: "scan-1",
		ownerId: "owner-1",
		status: "failed",
		error: "the reason",
	}
	const scanRow = Object.keys(getTableColumns(scans)).map((columnName) => scanValues[columnName] ?? null)
	connectionPool.query = ((queryConfig: { text: string }) => {
		const scanRows = queryConfig.text.startsWith("select") ? [scanRow] : []
		return Promise.resolve({ rows: scanRows, fields: [], rowCount: scanRows.length })
	}) as unknown as typeof connectionPool.query

	// spies on the key load and the Source ingest
	const loadOrProvisionUserLiteLLMKeySpy = spyOn(litellm, "loadOrProvisionUserLiteLLMKey")
	const ingestFromTopicSourcesSpy = spyOn(ingest, "ingestFromTopicSources")
	const thrownFailure = await ingestForScan("scan-1", "topic-1").catch((error: unknown) => error)

	// the failure has the Scan's reason and is not retried, and neither the key load nor a Source ran
	expect(thrownFailure).toBeInstanceOf(ApplicationFailure)
	expect(thrownFailure).toMatchObject({ message: "the reason", nonRetryable: true })
	expect(loadOrProvisionUserLiteLLMKeySpy).not.toHaveBeenCalled()
	expect(ingestFromTopicSourcesSpy).not.toHaveBeenCalled()
})
