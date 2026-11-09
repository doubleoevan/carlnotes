// a podcast cover's key, signed with the auth secret, and the path it is served at
import type { PodcastCover, PodcastCoverSize } from "@carlnotes/contracts/podcastEpisodes"
import { toAuthSecretSignature } from "./hmac"

/**
 * Returns a cover's key, an HMAC of what the cover draws under the app's auth secret. A new title or a new image makes
 * a new key.
 */
export function toPodcastCoverKey(podcastCover: PodcastCover): string {
	// key the hash with the app's auth secret, so that only the app can compute a cover's url. a show cover over the
	// illustration hashes its kind, id, and title, and a cover over a topic image adds the image's hash. a podcast
	// episode's cover hashes its own image and its detail line, or the topic's image if it has none
	const { kind, id, title, topicImageHash } = podcastCover
	const showFields = topicImageHash ? [kind, id, title, topicImageHash] : [kind, id, title]
	const coverFields =
		podcastCover.kind === "episode"
			? [
					kind,
					id,
					title,
					podcastCover.podcastEpisodeImageHash ? null : topicImageHash,
					podcastCover.podcastEpisodeImageHash,
					podcastCover.details,
				]
			: showFields
	const coverHash = toAuthSecretSignature({
		value: JSON.stringify(coverFields),
		purpose: "podcast cover urls",
		encoding: "hex",
	})
	return coverHash.slice(0, 32)
}

// the covers' template version, which names the stored objects so a template change redraws every cover
const PODCAST_COVER_TEMPLATE_VERSION = "v7"

/**
 * Returns the object key prefix of every stored cover of a show or a podcast episode, at the current template version.
 */
export function toPodcastCoverObjectKeyPrefix(kind: PodcastCover["kind"], id: string): string {
	return `podcast-covers/${PODCAST_COVER_TEMPLATE_VERSION}/${kind}/${id}/`
}

/**
 * Returns the object key a cover is stored under in the given size.
 */
export function toPodcastCoverObjectKey(podcastCover: PodcastCover, size: PodcastCoverSize): string {
	return `${toPodcastCoverObjectKeyPrefix(podcastCover.kind, podcastCover.id)}${toPodcastCoverKey(podcastCover)}-${size}.jpg`
}

/**
 * Returns the path that a cover is served at in the given size.
 */
export function toPodcastCoverPath(podcastCover: PodcastCover, size: PodcastCoverSize): string {
	return `/api/podcast-covers/${podcastCover.kind}/${podcastCover.id}/${toPodcastCoverKey(podcastCover)}-${size}.jpg`
}

/**
 * Returns a cover's latest key, an HMAC of its kind and id alone, which keeps naming the cover through a new title,
 * image, or detail line.
 */
export function toLatestPodcastCoverKey(kind: PodcastCover["kind"], id: string): string {
	const coverHash = toAuthSecretSignature({
		value: JSON.stringify(["latest", kind, id]),
		purpose: "podcast cover urls",
		encoding: "hex",
	})
	return coverHash.slice(0, 32)
}

/**
 * Returns the path that serves a cover's current drawing in the given size, for an email sent before the cover is final.
 */
export function toLatestPodcastCoverPath(podcastCover: PodcastCover, size: PodcastCoverSize): string {
	const latestKey = toLatestPodcastCoverKey(podcastCover.kind, podcastCover.id)
	return `/api/podcast-covers/${podcastCover.kind}/${podcastCover.id}/${latestKey}-${size}.jpg`
}
