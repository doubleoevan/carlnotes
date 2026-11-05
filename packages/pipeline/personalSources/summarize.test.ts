// real SDK calls use an in-memory proxy while storage and leases are scoped test doubles
import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test"
import * as claims from "@carlnotes/db/claim"
import { restoreConnectionPool, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import * as contexts from "@carlnotes/db/personalSourcesContext"
import { toChatCompletionResponse } from "@carlnotes/models/chatCompletionTestFixtures"
import * as spending from "@carlnotes/models/spendReservations"
import { stubReservedUserSpend } from "@carlnotes/models/spendReservationTestFixtures"
import { saveEnvSettings } from "@carlnotes/server/savedEnvSettings"
import { summarizePersonalSourcesContext } from "./summarize"

// synthetic content and credentials never identify a real account
const snapshot: contexts.PersonalSourcesContextSnapshot = {
	topicId: "topic",
	userId: "team-editor",
	billingUserId: "owner",
	revision: 3,
	topic: "Coffee",
	entries: "private-summarization-canary",
	entryIds: ["entry"],
	hasIncompleteCoverage: false,
	litellmApiKey: "fixture-owner-key",
}
const originalFetch = globalThis.fetch
const restoreEnvSettings = saveEnvSettings([
	"LITELLM_BASE_URL",
	"LITELLM_MASTER_KEY",
	"LANGFUSE_PUBLIC_KEY",
	"LANGFUSE_SECRET_KEY",
])
let requestHeaders: Headers[] = []
beforeEach(() => {
	// a lease exercises its callback without timers or a database connection
	spyOn(claims, "runWithClaim").mockImplementation(async ({ runTask }) => runTask(new AbortController().signal))

	spyOn(contexts, "loadPersonalSourcesContextSnapshot").mockResolvedValue({ ...snapshot })
	spyOn(contexts, "commitPersonalSourcesContext").mockResolvedValue(true)
	spyOn(contexts, "failPersonalSourcesContext").mockResolvedValue(true)
	stubReservedUserSpend()
	stubConnectionPool(({ text }) =>
		text.startsWith("select") ? [["topic"]] : text.startsWith("insert") ? [["spend"]] : [],
	)

	// all model and registry traffic remains local to this stub
	Bun.env.LITELLM_BASE_URL = "http://litellm.test"
	Bun.env.LITELLM_MASTER_KEY = "fixture-master-key"
	delete Bun.env.LANGFUSE_PUBLIC_KEY
	delete Bun.env.LANGFUSE_SECRET_KEY
	requestHeaders = []
	globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
		requestHeaders.push(new Headers(init?.headers))
		return toChatCompletionResponse("Useful bounded private context")
	}) as typeof fetch
})
afterEach(() => {
	mock.restore()
	restoreConnectionPool()
	restoreEnvSettings()
	globalThis.fetch = originalFetch
})

test("a rewrite uses only the owner's key, records one attempt, and redacts proxy content", async () => {
	const commits = spyOn(contexts, "commitPersonalSourcesContext")
	expect(await summarizePersonalSourcesContext("topic")).toBe("settled")
	expect(spyOn(spending, "reserveUserSpend").mock.calls[0]?.[0].userId).toBe("owner")
	expect(commits.mock.calls[0]?.[0].snapshot.userId).toBe("team-editor")
	expect(requestHeaders).toHaveLength(1)
	expect(requestHeaders[0]?.get("authorization")).toBe("Bearer fixture-owner-key")
	expect(requestHeaders[0]?.get("x-litellm-enable-message-redaction")).toBe("true")
	expect(commits).toHaveBeenCalledTimes(1)
	expect(commits.mock.calls[0]?.[0]).toMatchObject({ spendId: "spend", context: "Useful bounded private context" })
	expect(commits.mock.calls[0]?.[0].cost).toBeCloseTo(0.0000252, 10)
})

test("settled and empty revisions need no model call", async () => {
	spyOn(contexts, "loadPersonalSourcesContextSnapshot").mockResolvedValue(null)
	expect(await summarizePersonalSourcesContext("topic")).toBe("idle")
	spyOn(contexts, "loadPersonalSourcesContextSnapshot").mockResolvedValue({ ...snapshot, entries: "", entryIds: [] })
	expect(await summarizePersonalSourcesContext("topic")).toBe("settled")
	expect(requestHeaders).toHaveLength(0)
})

test("missing and exhausted owner keys retain recoverable state with zero model calls", async () => {
	const failures = spyOn(contexts, "failPersonalSourcesContext")
	spyOn(contexts, "loadPersonalSourcesContextSnapshot").mockResolvedValue({ ...snapshot, litellmApiKey: null })
	expect(await summarizePersonalSourcesContext("topic")).toBe("retry")
	expect(failures.mock.calls[0]?.[0].state).toBe("missing_key")
	spyOn(contexts, "loadPersonalSourcesContextSnapshot").mockResolvedValue(snapshot)
	spyOn(spending, "reserveUserSpend").mockResolvedValue("rejected")
	expect(await summarizePersonalSourcesContext("topic")).toBe("retry")
	expect(failures.mock.calls[1]?.[0].state).toBe("budget")
	expect(requestHeaders).toHaveLength(0)
})

test("stale output never commits as usable context and provider errors stay content-free", async () => {
	spyOn(contexts, "commitPersonalSourcesContext").mockResolvedValue(false)
	expect(await summarizePersonalSourcesContext("topic")).toBe("stale")
	globalThis.fetch = (async () => {
		throw new Error("private-summarization-canary")
	}) as unknown as typeof fetch
	expect(await summarizePersonalSourcesContext("topic")).toBe("retry")
	const failures = spyOn(contexts, "failPersonalSourcesContext")
	expect(failures.mock.calls.at(-1)?.[0].state).toBe("failed")
})

test("model output cannot exceed the stored 8,000-character limit", async () => {
	globalThis.fetch = (async () => toChatCompletionResponse("x".repeat(9000))) as unknown as typeof fetch
	const commits = spyOn(contexts, "commitPersonalSourcesContext")
	expect(await summarizePersonalSourcesContext("topic")).toBe("settled")
	expect(commits.mock.calls[0]?.[0].context.length).toBe(8000)
})

test("each actual retry has its own spend row while reusing a settled output makes no further call", async () => {
	// the first provider attempt fails ambiguously and the next one succeeds
	const queries = stubConnectionPool(({ text }) =>
		text.startsWith("select") ? [["topic"]] : text.startsWith("insert") ? [[crypto.randomUUID()]] : [],
	)
	globalThis.fetch = (async () => {
		throw new Error("private-summarization-canary")
	}) as unknown as typeof fetch
	expect(await summarizePersonalSourcesContext("topic")).toBe("retry")
	globalThis.fetch = (async () => toChatCompletionResponse("Settled private context")) as unknown as typeof fetch
	expect(await summarizePersonalSourcesContext("topic")).toBe("settled")
	spyOn(contexts, "loadPersonalSourcesContextSnapshot").mockResolvedValue(null)
	expect(await summarizePersonalSourcesContext("topic")).toBe("idle")
	expect(
		queries.filter(({ text }) => text.startsWith('insert into "personal_source_distillation_spends"')),
	).toHaveLength(2)
	expect(spyOn(contexts, "commitPersonalSourcesContext")).toHaveBeenCalledTimes(1)
	expect(queries.some(({ text }) => text.startsWith('update "scans"'))).toBe(false)
})

test("an ownership transfer before the paid attempt releases the reservation and never calls the model", async () => {
	spyOn(contexts, "startPersonalSourcesSummarySpend").mockResolvedValue(null)
	const release = mock(async () => {})
	spyOn(spending, "reserveUserSpend").mockResolvedValue({ release })
	expect(await summarizePersonalSourcesContext("topic")).toBe("stale")
	expect(release).toHaveBeenCalledTimes(1)
	expect(requestHeaders).toHaveLength(0)
})
