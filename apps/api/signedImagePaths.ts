// an image path's read signature: the path and an expiry signed under the auth secret, so a reader with no session,
// such as an MCP view in a host's frame, reads the file the path names until the expiry. each use signs under its own
// purpose, so a signature made for one use never opens another. a gated image path names the subject whose topic
// gates its file, so a caller signs only the paths of topics the reader may view

import { isSiteUrl } from "@carlnotes/contracts/site"
import { isSameSignature, toAuthSecretSignature } from "@carlnotes/server/hmac"

// a signed path lasts a day past the next whole hour, so one url holds for an hour of the browser's cache
const HOUR_SECONDS = 60 * 60
const SIGNED_PATH_LIFETIME_SECONDS = 24 * HOUR_SECONDS

// the purpose a gated image's signature signs under: a topic's, a podcast episode's, a film's, or a Topic Post's image
const GATED_IMAGE_PURPOSE = "gated-image"

// a path of a gated image file, with no query after it, that starts a url or follows its origin: the origin if any,
// the route, the id of the topic, podcast episode, or Topic Post whose topic gates the file, and the rest of the path.
// each part has a length limit, which keeps a match linear in a long string of repeated route prefixes
const GATED_IMAGE_PATH_PATTERN =
	/(?<![\w.\-:/])((?:https?:)?\/\/[\w.\-:]{1,100})?(\/api\/(topic-images|podcast-episode-images|topic-podcast-episode-video-images|topic-post-images)\/([\w-]{1,64})\/[\w\-./@]{1,200}\.(?:webp|jpg|png))(?![\w?])/g

// the subject a gated image route names by its id, whose topic gates the file
const GATED_IMAGE_SUBJECT_KINDS = {
	"topic-images": "topic",
	"podcast-episode-images": "podcastEpisode",
	"topic-podcast-episode-video-images": "podcastEpisode",
	"topic-post-images": "topicPost",
} as const

/**
 * The topic, podcast episode, or Topic Post a gated image path names, whose topic decides who may read the file.
 */
export type GatedImageSubject = {
	kind: (typeof GATED_IMAGE_SUBJECT_KINDS)[keyof typeof GATED_IMAGE_SUBJECT_KINDS]
	id: string
}

// a path to sign, what it is signed for, and the time the expiry counts from
export type ToSignedPathOptions = { path: string; purpose: string; nowMs?: number }

/**
 * Returns a path with a read signature for the purpose that lasts a day past the next whole hour.
 */
export function toSignedPath({ path, purpose, nowMs = Date.now() }: ToSignedPathOptions): string {
	const expires = Math.ceil(nowMs / 1000 / HOUR_SECONDS) * HOUR_SECONDS + SIGNED_PATH_LIFETIME_SECONDS
	return `${path}?expires=${expires}&signature=${toPathSignature({ path, purpose, expires })}`
}

// a request's path and its two query values as sent, the purpose the signature must sign, and the time to check at
export type IsValidPathSignatureOptions = {
	path: string
	purpose: string
	expires: string | undefined
	signature: string | undefined
	nowMs?: number
}

/**
 * Returns whether a request's signature signs its path for the purpose with an expiry that has not passed.
 */
export function isValidPathSignature({
	path,
	purpose,
	expires,
	signature,
	nowMs = Date.now(),
}: IsValidPathSignatureOptions): boolean {
	// an expiry is whole seconds that have not passed
	const expiresSeconds = Number(expires)
	if (!signature || !/^\d+$/.test(expires ?? "") || expiresSeconds * 1000 <= nowMs) {
		return false
	}
	return isSameSignature({ expectedSignature: toPathSignature({ path, purpose, expires: expiresSeconds }), signature })
}

// a signed request's path and its two query values as sent, and the time to check at
export type SignedPathCheckOptions = Omit<IsValidPathSignatureOptions, "purpose">

/**
 * Returns whether a gated image request carries a signature for its path that has not expired.
 */
export function isValidGatedImageSignature(options: SignedPathCheckOptions): boolean {
	return isValidPathSignature({ ...options, purpose: GATED_IMAGE_PURPOSE })
}

/**
 * Returns the subjects of every gated image path in a value's strings, at any depth of its arrays and plain objects.
 */
export function toGatedImageSubjects(value: unknown): GatedImageSubject[] {
	// each string's matches on the site, read while the strings are visited
	const subjects: GatedImageSubject[] = []
	mapStrings(value, (text) => {
		// a url on another origin names no subject
		for (const [, origin, , route, id] of text.matchAll(GATED_IMAGE_PATH_PATTERN)) {
			if (isSiteOrigin(origin)) {
				subjects.push(toGatedImageSubject(route, id))
			}
		}
		return text
	})

	// the subjects in the order their paths appear
	return subjects
}

// a value with gated image paths to sign, the check of whose subjects may be signed, and the time the expiry counts from
export type ToSignedGatedImagePathsOptions<Value> = {
	value: Value
	isSubjectSigned: (subject: GatedImageSubject) => boolean
	nowMs?: number
}

/**
 * Returns a value with each gated image path in its strings signed if its subject passes the check, at any depth of
 * its arrays and plain objects. A url on the site keeps its origin, and a url on another origin or a path that already
 * has a query stays as it is.
 */
export function toSignedGatedImagePaths<Value>({
	value,
	isSubjectSigned,
	nowMs = Date.now(),
}: ToSignedGatedImagePathsOptions<Value>): Value {
	return mapStrings(value, (text) =>
		text.replace(
			GATED_IMAGE_PATH_PATTERN,
			(url, origin: string | undefined, path: string, route: string, id: string) =>
				isSiteOrigin(origin) && isSubjectSigned(toGatedImageSubject(route, id))
					? `${origin ?? ""}${toSignedPath({ path, purpose: GATED_IMAGE_PURPOSE, nowMs })}`
					: url,
		),
	) as Value
}

// whether a gated image path's origin is the site's own, or the path has none and reads against the site
function isSiteOrigin(origin: string | undefined): boolean {
	return origin === undefined || isSiteUrl(origin)
}

// a gated image path's subject, from the route and the id the pattern captured
function toGatedImageSubject(route: string | undefined, id: string | undefined): GatedImageSubject {
	return { kind: GATED_IMAGE_SUBJECT_KINDS[route as keyof typeof GATED_IMAGE_SUBJECT_KINDS], id: id ?? "" }
}

// a value with each of its strings mapped, at any depth of its arrays and plain objects. any other object, such as a
// Date, stays as it is
function mapStrings(value: unknown, mapString: (text: string) => string): unknown {
	if (typeof value === "string") {
		return mapString(value)
	}

	// an array and a plain object map their values
	if (Array.isArray(value)) {
		return value.map((item) => mapStrings(item, mapString))
	}
	if (value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
		return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, mapStrings(item, mapString)]))
	}
	return value
}

// the signature of a path for a purpose until an expiry
function toPathSignature({ path, purpose, expires }: { path: string; purpose: string; expires: number }): string {
	return toAuthSecretSignature({
		value: `${purpose}|${path}|${expires}`,
		purpose: "signed image urls",
		encoding: "base64url",
	})
}
