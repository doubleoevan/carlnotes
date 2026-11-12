// a Resource's image fetch, with the connection pool, storage, and every fetch stubbed: an unsafe Resource gets
// none and loses any stored, a fetched Resource fetches nothing, a fetch keeps the page's own images and its link
// preview image, a dead image is dropped alone, and no page is scraped
import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test"
import { restoreConnectionPool, type SentQuery, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import * as jobLease from "@carlnotes/db/jobLease"
import * as storage from "@carlnotes/db/store"
import * as moderation from "@carlnotes/models/moderation"
import * as monitoring from "@carlnotes/server/monitoring"
import * as linkPreview from "../linkPreview"
import { loadOrFetchResourceImages } from "./fetchResourceImages"
import { toTestImageBytes } from "./resourceImageTestFixtures"

// the page the tests fetch, and the Markdown the Scan stored for it: two images of its own and a related story's
const PAGE_URL = "https://news.example.com/articles/warriors-rumors"
const PAGE_MARKDOWN = [
	"![Lead](https://cdn.example.com/lead.jpg)",
	"[![Teaser](https://cdn.example.com/teaser.jpg)](https://news.example.com/articles/other)",
	"![Chart](https://cdn.example.com/chart.jpg)",
].join("\n\n")

// a Resource row as the fetch reads it: id, url, unsafe, content key, and when its images were fetched
type ResourceRowOptions = { url?: string; isUnsafe?: boolean; contentKey?: string | null; imagesFetchedAt?: string }
function toResourceRow({
	url = PAGE_URL,
	isUnsafe = false,
	contentKey = "resources/r1/content.md",
	imagesFetchedAt,
}: ResourceRowOptions = {}): unknown[] {
	return ["r1", url, isUnsafe, contentKey, imagesFetchedAt ?? null]
}

// a stored image row as the fetch reads it: resource, object key, width, height, and the link preview flag
const STORED_IMAGE_ROWS = [
	["r1", "resources/r1/images/0.jpg", 2560, 1440, true],
	["r1", "resources/r1/images/1.jpg", 1200, 675, false],
]

// what the stubbed pool returns: the Resource's row, its stored image rows, whether another film's fetch has
// finished by the time this one looks again, and whether the Resource is judged unsafe while its images are fetched
type StubReadsOptions = {
	resourceRow: unknown[]
	storedImageRows?: unknown[][]
	isFetchedMeanwhile?: boolean
	isUnsafeMeanwhile?: boolean
}

// answer the fetch's reads and its record by the table and the columns each query names
function stubReads({
	resourceRow,
	storedImageRows = [],
	isFetchedMeanwhile = false,
	isUnsafeMeanwhile = false,
}: StubReadsOptions): SentQuery[] {
	// what each of the fetch's own queries returns, by how the query starts: the second look at whether the fetch
	// ran, the Markdown a Resource keeps on its row, and the fetch's record, which finds no safe Resource to mark
	const fetchedAt = isFetchedMeanwhile ? "2026-11-11 10:00:00+00" : resourceRow[4]
	const rowsByQueryStart: [string, unknown[][]][] = [
		['select "images_fetched_at" from "resources"', [[fetchedAt]]],
		['select "content" from "resources"', [[null]]],
		['update "resources"', isUnsafeMeanwhile ? [] : [["r1"]]],
	]

	// answer each query by its table, or by its start
	return stubConnectionPool(({ text }) => {
		if (text.startsWith("select") && text.includes('from "resource_images"')) {
			return storedImageRows
		}
		const matchedRows = rowsByQueryStart.find(([queryStart]) => text.startsWith(queryStart))?.[1]
		if (matchedRows) {
			return matchedRows
		}

		// the Resource's own row
		return text.startsWith("select") && text.includes('from "resources"') ? [resourceRow] : []
	})
}

// the spies every test reads
let fetchImage: ReturnType<typeof spyOn>
let fetchMetadata: ReturnType<typeof spyOn>
let upload: ReturnType<typeof spyOn>
let deleteObjects: ReturnType<typeof spyOn>
let reportError: ReturnType<typeof spyOn>
let fetchSpy: ReturnType<typeof spyOn>
let runUnderLease: ReturnType<typeof spyOn>
let classifyImage: ReturnType<typeof spyOn>

// each image url's picture, drawn once
const imageBytesByUrl = new Map<string, Uint8Array>()

// stored Markdown that shows the page's images, a picture for each image url, and a link preview image of its own
beforeEach(async () => {
	imageBytesByUrl.set(
		"https://cdn.example.com/lead.jpg",
		await toTestImageBytes({ width: 1600, height: 900, picture: 1 }),
	)
	imageBytesByUrl.set(
		"https://cdn.example.com/chart.jpg",
		await toTestImageBytes({ width: 1200, height: 800, picture: 2 }),
	)
	imageBytesByUrl.set(
		"https://cdn.example.com/og.jpg",
		await toTestImageBytes({ width: 1200, height: 630, picture: 3 }),
	)
	spyOn(storage, "getResourceContent").mockResolvedValue(PAGE_MARKDOWN)
	upload = spyOn(storage, "uploadAttachment").mockResolvedValue(undefined)
	deleteObjects = spyOn(storage, "deleteStoredObjects").mockResolvedValue(undefined)
	reportError = spyOn(monitoring, "reportError").mockImplementation(() => {})

	// an image fetch returns the url's picture, or fails for a url with none. the page's tags name the link preview image
	fetchImage = spyOn(linkPreview, "fetchLinkPreviewImage").mockImplementation(async (imageUrl: string) => {
		const bytes = imageBytesByUrl.get(imageUrl)
		if (!bytes) {
			throw new Error(`link preview image fetch for ${imageUrl} answered 404`)
		}
		return { bytes, contentType: "image/jpeg" }
	})
	fetchMetadata = spyOn(linkPreview, "fetchLinkPreviewMetadata").mockResolvedValue({
		title: "Warriors rumors",
		description: null,
		imageUrl: "https://cdn.example.com/og.jpg",
	})

	// the image moderation passes every image, whatever key the environment holds
	classifyImage = spyOn(moderation, "classifyImage").mockResolvedValue({
		outcome: "classified",
		verdict: { isViolation: false, category: null },
	})

	// the fetch takes its Resource's lease at once, and a wait for another film's fetch does not pause the test
	runUnderLease = spyOn(jobLease, "runWithJobLease").mockImplementation(async ({ runTask }) =>
		runTask(new AbortController().signal),
	)
	spyOn(Bun, "sleep").mockResolvedValue(undefined)

	// any other request, such as a scrape, fails the test that makes it
	fetchSpy = spyOn(globalThis, "fetch").mockRejectedValue(new Error("no request is expected"))
})

// put the pool and every spy back after each test
afterEach(() => {
	restoreConnectionPool()
	mock.restore()
	imageBytesByUrl.clear()
})

test("an unsafe Resource gets none, and nothing is fetched or stored for it", async () => {
	stubReads({ resourceRow: toResourceRow({ isUnsafe: true }) })
	const resourceImagesById = await loadOrFetchResourceImages(["r1"])
	expect(resourceImagesById.get("r1")).toEqual([])
	expect(fetchImage).not.toHaveBeenCalled()
	expect(fetchMetadata).not.toHaveBeenCalled()
	expect(upload).not.toHaveBeenCalled()
})

test("a Resource judged unsafe later loses its stored images", async () => {
	const sentQueries = stubReads({ resourceRow: toResourceRow({ isUnsafe: true }), storedImageRows: STORED_IMAGE_ROWS })
	const resourceImagesById = await loadOrFetchResourceImages(["r1"])
	expect(resourceImagesById.get("r1")).toEqual([])
	expect(sentQueries.some((sentQuery) => sentQuery.text.startsWith('delete from "resource_images"'))).toBe(true)
	expect(deleteObjects).toHaveBeenCalledWith(["resources/r1/images/0.jpg", "resources/r1/images/1.jpg"])
})

test("a fetched Resource returns its stored images in order and fetches nothing", async () => {
	const fetchedRow = toResourceRow({ imagesFetchedAt: "2026-11-11 10:00:00+00" })
	stubReads({ resourceRow: fetchedRow, storedImageRows: STORED_IMAGE_ROWS })
	const resourceImagesById = await loadOrFetchResourceImages(["r1", "r1"])
	expect(resourceImagesById.get("r1")).toEqual([
		{ objectKey: "resources/r1/images/0.jpg", width: 2560, height: 1440, isLinkPreviewImage: true },
		{ objectKey: "resources/r1/images/1.jpg", width: 1200, height: 675, isLinkPreviewImage: false },
	])
	expect(fetchImage).not.toHaveBeenCalled()
	expect(fetchMetadata).not.toHaveBeenCalled()
})

test("a Resource whose fetch kept no image is not fetched twice", async () => {
	stubReads({ resourceRow: toResourceRow({ imagesFetchedAt: "2026-11-11 10:00:00+00" }) })
	expect((await loadOrFetchResourceImages(["r1"])).get("r1")).toEqual([])
	expect(fetchImage).not.toHaveBeenCalled()
})

test("a fetch stores the page's own images after its link preview image, and scrapes nothing", async () => {
	const sentQueries = stubReads({ resourceRow: toResourceRow() })
	const resourceImages = (await loadOrFetchResourceImages(["r1"])).get("r1")

	// the link preview image the content does not show goes first, then the page's own two, and never the teaser
	expect(resourceImages).toEqual([
		{ objectKey: "resources/r1/images/0.jpg", width: 1200, height: 630, isLinkPreviewImage: true },
		{ objectKey: "resources/r1/images/1.jpg", width: 1600, height: 900, isLinkPreviewImage: false },
		{ objectKey: "resources/r1/images/2.jpg", width: 1200, height: 800, isLinkPreviewImage: false },
	])
	const fetchedUrls = fetchImage.mock.calls.map(([imageUrl]: [string]) => imageUrl)
	expect(fetchedUrls).not.toContain("https://cdn.example.com/teaser.jpg")

	// each is uploaded as a jpeg, the fetch is recorded with its rows, and no other request is made
	expect(upload.mock.calls.map(([objectKey]: [string]) => objectKey)).toEqual(
		resourceImages?.map((image) => image.objectKey),
	)
	expect(
		upload.mock.calls.every(([, , contentType]: [string, Uint8Array, string]) => contentType === "image/jpeg"),
	).toBe(true)
	expect(sentQueries.some((sentQuery) => sentQuery.text.startsWith('update "resources"'))).toBe(true)
	expect(sentQueries.some((sentQuery) => sentQuery.text.startsWith('insert into "resource_images"'))).toBe(true)
	expect(fetchSpy).not.toHaveBeenCalled()
})

test("a gallery page keeps six images, the link preview image first", async () => {
	// eight different pictures in the page's content
	const galleryUrls = Array.from({ length: 8 }, (_, i) => `https://cdn.example.com/gallery-${i}.jpg`)
	for (const [i, galleryUrl] of galleryUrls.entries()) {
		imageBytesByUrl.set(galleryUrl, await toTestImageBytes({ width: 1600, height: 900, picture: 10 + i }))
	}
	spyOn(storage, "getResourceContent").mockResolvedValue(galleryUrls.map((url) => `![](${url})`).join("\n\n"))
	stubReads({ resourceRow: toResourceRow() })

	// the link preview image and the first five of the gallery
	const resourceImages = (await loadOrFetchResourceImages(["r1"])).get("r1")
	expect(resourceImages).toHaveLength(6)
	expect(resourceImages?.map((image) => image.isLinkPreviewImage)).toEqual([true, false, false, false, false, false])
})

test("a link preview image whose url names a logo is never fetched", async () => {
	fetchMetadata.mockResolvedValue({
		title: "Warriors rumors",
		description: null,
		imageUrl: "https://cdn.example.com/brand/logo.png",
	})
	stubReads({ resourceRow: toResourceRow() })
	const resourceImages = (await loadOrFetchResourceImages(["r1"])).get("r1")
	expect(resourceImages?.map((image) => image.isLinkPreviewImage)).toEqual([false, false])
	expect(fetchImage.mock.calls.map(([imageUrl]: [string]) => imageUrl)).not.toContain(
		"https://cdn.example.com/brand/logo.png",
	)
})

test("an image the moderation flags is not stored, and a failed check leaves the fetch for the next call", async () => {
	// the moderation flags the first image it checks, the page's lead image
	classifyImage.mockResolvedValueOnce({ outcome: "classified", verdict: { isViolation: true, category: "sexual" } })
	stubReads({ resourceRow: toResourceRow() })
	const resourceImages = (await loadOrFetchResourceImages(["r1"])).get("r1")
	expect(resourceImages).toHaveLength(2)
	expect(upload).toHaveBeenCalledTimes(2)

	// a check that fails stores nothing and records no fetch, so the next call fetches again
	upload.mockClear()
	classifyImage.mockResolvedValue({ outcome: "failed", error: new Error("the moderation endpoint returned 500") })
	const sentQueries = stubReads({ resourceRow: toResourceRow() })
	expect((await loadOrFetchResourceImages(["r1"])).get("r1")).toEqual([])
	expect(upload).not.toHaveBeenCalled()
	expect(sentQueries.some((sentQuery) => sentQuery.text.startsWith('update "resources"'))).toBe(false)
	expect(reportError).toHaveBeenCalledTimes(1)
})

test("each image is fetched with the fetch's size limit and image types", async () => {
	stubReads({ resourceRow: toResourceRow() })
	await loadOrFetchResourceImages(["r1"])
	const [, maxBytes, imageTypes] = fetchImage.mock.calls[0] as [string, number, Set<string>]
	expect(maxBytes).toBe(8 * 1024 * 1024)
	expect([...imageTypes].sort()).toEqual(["image/avif", "image/jpeg", "image/png", "image/webp"])
})

test("a dead image is dropped alone", async () => {
	imageBytesByUrl.delete("https://cdn.example.com/lead.jpg")
	stubReads({ resourceRow: toResourceRow() })
	const resourceImages = (await loadOrFetchResourceImages(["r1"])).get("r1")
	expect(resourceImages?.map((image) => [image.width, image.height])).toEqual([
		[1200, 630],
		[1200, 800],
	])
	expect(reportError).not.toHaveBeenCalled()
})

test("a Resource with no stored Markdown keeps its link preview image alone", async () => {
	stubReads({ resourceRow: toResourceRow({ contentKey: null }) })
	const resourceImages = (await loadOrFetchResourceImages(["r1"])).get("r1")
	expect(resourceImages).toEqual([
		{ objectKey: "resources/r1/images/0.jpg", width: 1200, height: 630, isLinkPreviewImage: true },
	])
})

test("a Resource whose page offers no link preview image keeps none, and its fetch is recorded", async () => {
	fetchMetadata.mockResolvedValue({ title: "A thread", description: null, imageUrl: null })
	const redditRow = toResourceRow({ url: "https://www.reddit.com/r/nba/comments/abc/thread", contentKey: null })
	const sentQueries = stubReads({ resourceRow: redditRow })
	expect((await loadOrFetchResourceImages(["r1"])).get("r1")).toEqual([])
	expect(sentQueries.some((sentQuery) => sentQuery.text.startsWith('update "resources"'))).toBe(true)
	expect(upload).not.toHaveBeenCalled()
})

test("a YouTube video keeps its largest thumbnail", async () => {
	const thumbnailUrl = "https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg"
	imageBytesByUrl.set(thumbnailUrl, await toTestImageBytes({ width: 1280, height: 720, picture: 4 }))
	const youtubeRow = toResourceRow({ url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", contentKey: null })
	stubReads({ resourceRow: youtubeRow })
	const resourceImages = (await loadOrFetchResourceImages(["r1"])).get("r1")
	expect(resourceImages).toEqual([
		{ objectKey: "resources/r1/images/0.jpg", width: 1280, height: 720, isLinkPreviewImage: true },
	])
	expect(fetchMetadata).not.toHaveBeenCalled()
})

test("a Resource judged unsafe during its fetch records no image and shows none", async () => {
	const sentQueries = stubReads({ resourceRow: toResourceRow(), isUnsafeMeanwhile: true })
	expect((await loadOrFetchResourceImages(["r1"])).get("r1")).toEqual([])
	expect(sentQueries.some((sentQuery) => sentQuery.text.startsWith('insert into "resource_images"'))).toBe(false)
})

test("a fetch that another film finished first returns that film's images and stores nothing", async () => {
	stubReads({ resourceRow: toResourceRow(), storedImageRows: STORED_IMAGE_ROWS, isFetchedMeanwhile: true })
	const resourceImages = (await loadOrFetchResourceImages(["r1"])).get("r1")
	expect(resourceImages?.map((image) => image.objectKey)).toEqual([
		"resources/r1/images/0.jpg",
		"resources/r1/images/1.jpg",
	])
	expect(fetchImage).not.toHaveBeenCalled()
	expect(upload).not.toHaveBeenCalled()
})

test("a film that finds another film fetching waits for what it stores", async () => {
	// another film holds the Resource's lease, and its fetch is recorded by the time this film looks
	runUnderLease.mockResolvedValue(null)
	stubReads({ resourceRow: toResourceRow(), storedImageRows: STORED_IMAGE_ROWS, isFetchedMeanwhile: true })
	const resourceImages = (await loadOrFetchResourceImages(["r1"])).get("r1")
	expect(resourceImages).toHaveLength(2)
	expect(fetchImage).not.toHaveBeenCalled()
	expect(upload).not.toHaveBeenCalled()
})

test("a fetch whose upload fails is reported, returns no image, and deletes what it uploaded", async () => {
	// the first upload lands and the second fails
	upload.mockResolvedValueOnce(undefined).mockRejectedValue(new Error("the bucket is down"))
	const sentQueries = stubReads({ resourceRow: toResourceRow() })
	expect((await loadOrFetchResourceImages(["r1"])).get("r1")).toEqual([])
	expect(reportError).toHaveBeenCalledTimes(1)

	// the uploaded image is deleted, and no image row is written
	expect(deleteObjects).toHaveBeenCalledWith(["resources/r1/images/0.jpg"])
	const queryTexts = sentQueries.map((sentQuery) => sentQuery.text)
	expect(queryTexts.some((text) => text.startsWith('insert into "resource_images"'))).toBe(false)
})
