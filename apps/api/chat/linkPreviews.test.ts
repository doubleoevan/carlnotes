// link preview tests: a url a Scan judged unsafe gets its card with no image fetched or shown, and a safe url gets its
// image
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { restoreConnectionPool, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import * as store from "@carlnotes/db/store"
import * as linkPreview from "@carlnotes/pipeline/linkPreview"
import { loadLinkPreviewImage, loadOrFetchLinkPreview, loadUnsafeLinkPreviewUrls } from "./linkPreviews"

// put back the connection pool and every spied function after each test
afterEach(() => {
	restoreConnectionPool()
	mock.restore()
})

// fetches the preview for a url whose Resource is or is not marked unsafe, and returns whether its image was fetched
async function isPreviewImageFetched(isUnsafe: boolean): Promise<boolean> {
	// nothing stored yet, the preview row's id on insert, and the Resource's unsafe mark
	stubConnectionPool(({ text }) => {
		if (text.startsWith('insert into "link_previews"')) {
			return [["preview-1"]]
		}
		return text.includes('from "resources"') && isUnsafe ? [["https://example.com/page"]] : []
	})

	// a page that offers a title, a description, and an image, and an image fetch and store that record the call
	spyOn(linkPreview, "fetchLinkPreviewMetadata").mockResolvedValue({
		title: "A page",
		description: "What it says",
		imageUrl: "https://example.com/image.png",
	})
	const fetchImageSpy = spyOn(linkPreview, "fetchLinkPreviewImage").mockResolvedValue({
		bytes: new Uint8Array([1]),
		contentType: "image/png",
	})
	spyOn(store, "uploadAttachment").mockResolvedValue()
	await loadOrFetchLinkPreview("https://example.com/page")
	return fetchImageSpy.mock.calls.length > 0
}

// a url that a Scan marked unsafe never has its image requested
test("an unsafe Resource's url gets no preview image", async () => {
	expect(await isPreviewImageFetched(true)).toBe(false)
})

// a url that is not marked unsafe gets its image
test("a safe url gets its preview image", async () => {
	expect(await isPreviewImageFetched(false)).toBe(true)
})

// an image stored before its page was judged unsafe is no longer served
test("a stored image of an unsafe page is not served", async () => {
	// a stored preview with an image, whose page's Resource is unsafe
	stubConnectionPool(({ text }) => {
		if (text.includes('from "link_previews"')) {
			return [["https://example.com/page", "link-previews/preview-1.png", "image/png"]]
		}
		return text.includes('from "resources"') ? [["https://example.com/page"]] : []
	})

	// the image route finds nothing to serve
	expect(await loadLinkPreviewImage("preview-1")).toBeNull()
})

// two preview urls that share one canonical url are both matched to its unsafe Resource
test("every url variant of an unsafe page is matched", async () => {
	stubConnectionPool(({ text }) => (text.includes('from "resources"') ? [["https://example.com/page"]] : []))
	const unsafeUrls = await loadUnsafeLinkPreviewUrls(["https://example.com/page", "https://EXAMPLE.com/page/"])
	expect(unsafeUrls.size).toBe(2)
})
