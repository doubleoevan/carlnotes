// signed image path tests: a gated image path signs and checks under its purpose until it expires, a signature for one
// purpose opens no other, a value's gated image paths name their subjects and are signed at any depth where the check
// passes, and a long string of repeated route prefixes is scanned in linear time
import { afterAll, beforeEach, expect, test } from "bun:test"
import { saveEnvSettings } from "@carlnotes/server/savedEnvSettings"
import {
	isValidGatedImageSignature,
	isValidPathSignature,
	toGatedImageSubjects,
	toSignedGatedImagePaths,
	toSignedPath,
} from "./signedImagePaths"

// the signing secret, set before each test and put back after the file
const restoreEnvSettings = saveEnvSettings(["BETTER_AUTH_SECRET"])
beforeEach(() => {
	Bun.env.BETTER_AUTH_SECRET = "test-secret"
})
afterAll(restoreEnvSettings)

// a private topic's image path, and the time the signatures count from
const IMAGE_PATH = "/api/topic-images/topic-1/0123456789abcdef0123456789abcdef/list@2x.webp"
const NOW_MS = Date.UTC(2026, 10, 21, 10, 30)

// a path signed for every subject at the test's time
function toSignedImagePath(path: string): string {
	return toSignedGatedImagePaths({ value: path, isSubjectSigned: () => true, nowMs: NOW_MS })
}

// a signed url's path and its two query values
function toSignedParts(signedUrl: string): {
	path: string
	expires: string | undefined
	signature: string | undefined
} {
	const url = new URL(signedUrl, "https://carlnotes.com")
	return {
		path: url.pathname,
		expires: url.searchParams.get("expires") ?? undefined,
		signature: url.searchParams.get("signature") ?? undefined,
	}
}

test("a signed gated image path checks until it expires, and no longer", () => {
	const signedParts = toSignedParts(toSignedImagePath(IMAGE_PATH))
	expect(signedParts.path).toBe(IMAGE_PATH)
	expect(isValidGatedImageSignature({ ...signedParts, nowMs: NOW_MS })).toBe(true)

	// the expiry is a day past the next whole hour
	expect(Number(signedParts.expires)).toBe(Date.UTC(2026, 10, 22, 11) / 1000)
	expect(isValidGatedImageSignature({ ...signedParts, nowMs: Date.UTC(2026, 10, 22, 11) })).toBe(false)
})

test("a signature checks for its own path and purpose alone", () => {
	const signedParts = toSignedParts(toSignedImagePath(IMAGE_PATH))

	// another file of the topic, a forged expiry, and a missing signature are refused
	const otherPath = IMAGE_PATH.replace("list@2x", "page@2x")
	expect(isValidGatedImageSignature({ ...signedParts, path: otherPath, nowMs: NOW_MS })).toBe(false)
	expect(isValidGatedImageSignature({ ...signedParts, expires: "9999999999", nowMs: NOW_MS })).toBe(false)
	expect(isValidGatedImageSignature({ ...signedParts, signature: undefined, nowMs: NOW_MS })).toBe(false)

	// a body image's signature for the same path opens no gated image, and a gated image's opens no body image
	const bodyImageParts = toSignedParts(
		toSignedPath({ path: IMAGE_PATH, purpose: "topic-post-body-image", nowMs: NOW_MS }),
	)
	expect(isValidGatedImageSignature({ ...bodyImageParts, nowMs: NOW_MS })).toBe(false)
	expect(isValidPathSignature({ ...signedParts, purpose: "topic-post-body-image", nowMs: NOW_MS })).toBe(false)
})

test("a value's gated image paths name their subjects, and only the checked ones are signed, at any depth", () => {
	const createdAt = new Date(NOW_MS)
	const toolResult = {
		content: [{ type: "text", text: JSON.stringify({ image: `https://carlnotes.com${IMAGE_PATH}` }) }],
		structuredContent: {
			topic: { image: { list: { url: IMAGE_PATH } }, createdAt },
			podcastEpisode: "/api/podcast-episode-images/episode-1/abc/page.webp",
			film: "/api/topic-podcast-episode-video-images/episode-2/chapters/2/image.jpg",
			topicPost: "/api/topic-post-images/post-1/abc/page.webp",
			avatar: "/api/avatars/user-1/3",
			signedAlready: `${IMAGE_PATH}?expires=1&signature=abc`,
		},
	}

	// every gated path names its subject, and an avatar or an already signed path names none
	expect(toGatedImageSubjects(toolResult)).toEqual([
		{ kind: "topic", id: "topic-1" },
		{ kind: "topic", id: "topic-1" },
		{ kind: "podcastEpisode", id: "episode-1" },
		{ kind: "podcastEpisode", id: "episode-2" },
		{ kind: "topicPost", id: "post-1" },
	])

	// the topic's paths are signed, an absolute url keeps its origin, and the other subjects stay unsigned
	const signedResult = toSignedGatedImagePaths({
		value: toolResult,
		isSubjectSigned: (subject) => subject.kind === "topic",
		nowMs: NOW_MS,
	})
	const signedText = JSON.parse(signedResult.content[0]?.text ?? "{}") as { image: string }
	expect(signedText.image).toStartWith(`https://carlnotes.com${IMAGE_PATH}?expires=`)
	expect(signedResult.structuredContent.topic.image.list.url).toStartWith(`${IMAGE_PATH}?expires=`)
	expect(signedResult.structuredContent.podcastEpisode).toBe(toolResult.structuredContent.podcastEpisode)
	expect(signedResult.structuredContent.topicPost).toBe(toolResult.structuredContent.topicPost)

	// an avatar, an already signed path, and a Date stay as they are
	expect(signedResult.structuredContent.avatar).toBe("/api/avatars/user-1/3")
	expect(signedResult.structuredContent.signedAlready).toBe(`${IMAGE_PATH}?expires=1&signature=abc`)
	expect(signedResult.structuredContent.topic.createdAt).toBe(createdAt)
})

test("a gated image path on another origin names no subject and stays unsigned", () => {
	// another origin with and without a scheme, and a path glued to another host's name
	const foreignUrls = [
		`https://attacker.example${IMAGE_PATH}`,
		`//attacker.example${IMAGE_PATH}`,
		`attacker.example${IMAGE_PATH}`,
	]
	const text = foreignUrls.join(" ")
	expect(toGatedImageSubjects(text)).toEqual([])
	expect(toSignedImagePath(text)).toBe(text)
})

test("a long string of repeated route prefixes with no file is scanned in linear time", () => {
	const repeatedPrefixes = "/api/topic-images/".repeat(28_000)
	const startedAtMs = performance.now()
	expect(toGatedImageSubjects(repeatedPrefixes)).toEqual([])
	expect(performance.now() - startedAtMs).toBeLessThan(500)
})
