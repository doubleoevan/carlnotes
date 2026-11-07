// a reopened Finding reuses the link preview it read
import { afterEach, expect, test } from "bun:test"
import { configureApiClient } from "@carlnotes/client/apiClient"
import { useFindingLinkPreview } from "@carlnotes/core/hooks/useFindingLinkPreview"
import { renderTestHook, waitForHook } from "@/lib/hookTestHarness"

// restore transport and release each hook's query client
const originalFetch = globalThis.fetch
const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
	for (const close of cleanups.splice(0)) {
		await close()
	}
	globalThis.fetch = originalFetch
	configureApiClient({ apiBaseUrl: "", showError: () => {} })
})

// a popover's preview, which shows the words a test reads
function FindingPreview({ findingId, isEnabled }: { findingId: string; isEnabled?: boolean }) {
	const { linkPreview, isLoading } = useFindingLinkPreview(findingId, isEnabled)
	return <p>{isLoading ? "loading" : (linkPreview?.title ?? "no preview")}</p>
}

// record each read, and return a preview titled by its Finding
function stubLinkPreviewReads(): string[] {
	const requests: string[] = []
	configureApiClient({ apiBaseUrl: "https://test.example", showError: () => {} })
	globalThis.fetch = (async (input: RequestInfo | URL) => {
		const url = new Request(input).url
		requests.push(url)
		return Response.json({
			linkPreview: {
				url: "https://example.com",
				title: url.includes("finding-2") ? "Second page" : "First page",
				description: null,
				imagePath: null,
				faviconPath: null,
				youtubeVideoId: null,
			},
		})
	}) as typeof fetch
	return requests
}

test("a reopened Finding shows its link preview with no read, and another Finding reads its own", async () => {
	const requests = stubLinkPreviewReads()
	let shownFindingId: string | null = "finding-1"
	const harness = await renderTestHook(
		() => null,
		() => (shownFindingId ? <FindingPreview findingId={shownFindingId} /> : null),
	)
	cleanups.push(harness.close)
	await waitForHook(() => harness.container.textContent === "First page")

	// close and reopen the same Finding
	shownFindingId = null
	await harness.render()
	shownFindingId = "finding-1"
	await harness.render()
	expect(harness.container.textContent).toBe("First page")
	expect(requests).toHaveLength(1)

	// another Finding has its own read
	shownFindingId = "finding-2"
	await harness.render()
	await waitForHook(() => harness.container.textContent === "Second page")
	expect(requests).toHaveLength(2)
})

test("a preview read turned off reads nothing and shows no loading", async () => {
	const requests = stubLinkPreviewReads()
	const harness = await renderTestHook(
		() => null,
		() => <FindingPreview findingId="finding-1" isEnabled={false} />,
	)
	cleanups.push(harness.close)
	expect(harness.container.textContent).toBe("no preview")
	expect(requests).toHaveLength(0)
})
