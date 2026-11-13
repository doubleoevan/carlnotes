// a topic image from a url: a page instead of an image, an image past the upload limit, and a private address are each
// rejected before anything is stored
import { afterEach, expect, mock, test } from "bun:test"
import * as dnsPromises from "node:dns/promises"
import { MAX_TOPIC_IMAGE_UPLOAD_BYTES } from "@carlnotes/contracts/topicImages"
import { setTopicImageFromUrl, type TopicImageEditor } from "./topicImageEdits"

// stand in for dns so the .example hosts resolve here to a fixed public address. every other host keeps the real
// resolver, so the mock cannot leak into other tests
mock.module("node:dns/promises", () => ({
	...dnsPromises,
	lookup: (host: string, options: { all: true }) =>
		host.endsWith(".example")
			? Promise.resolve([{ address: "93.184.216.34", family: 4 }])
			: dnsPromises.lookup(host, options),
}))

// the editor every call runs as, and the fetch each test replaces
const TEST_EDITOR: TopicImageEditor = { userId: "user-1", topic: { id: "topic-1", ownerId: "user-1" } }
const originalFetch = globalThis.fetch

// put the network back after each test
afterEach(() => {
	globalThis.fetch = originalFetch
})

// answer every request with this body and content type, and record what was requested
function stubFetch(body: BodyInit, contentType: string): string[] {
	const requestedUrls: string[] = []
	globalThis.fetch = (async (input: string | URL | Request) => {
		requestedUrls.push(input.toString())
		return new Response(body, { headers: { "content-type": contentType } })
	}) as typeof fetch
	return requestedUrls
}

// set the image from a url as the test editor
function setImage(imageUrl: string): ReturnType<typeof setTopicImageFromUrl> {
	return setTopicImageFromUrl({ topicImageEditor: TEST_EDITOR, imageUrl, analyticsProperties: {} as never })
}

// a page is not an image
test("a url that returns a page is unreadable", async () => {
	stubFetch("<html></html>", "text/html")
	expect(await setImage("https://images.example/page")).toEqual({ status: "unreadableUrl" })
})

// an image one byte past the upload limit is too large
test("an image past the upload limit is too large", async () => {
	stubFetch(new Uint8Array(MAX_TOPIC_IMAGE_UPLOAD_BYTES + 1), "image/png")
	expect(await setImage("https://images.example/big.png")).toEqual({ status: "tooLarge" })
})

// a private address is never requested
test("a private address is unreadable and never fetched", async () => {
	const requestedUrls = stubFetch(new Uint8Array(16), "image/png")
	expect(await setImage("http://10.0.0.5/cover.png")).toEqual({ status: "unreadableUrl" })
	expect(requestedUrls).toHaveLength(0)
})
