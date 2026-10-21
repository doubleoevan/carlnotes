// a podcast cover's key, signed with the auth secret, and the path it is served at
import type { PodcastCover, PodcastCoverSize } from "@carlnotes/contracts/podcastEpisodes"
import { toAuthSecretSignature } from "./hmac"

/**
 * Returns a cover's key, an HMAC of its kind, id, and title under the app's auth secret. A new title makes a new key.
 */
export function toPodcastCoverKey({ kind, id, title }: PodcastCover): string {
	// key the hash with the app's auth secret, so that only the app can compute a cover's url
	const coverHash = toAuthSecretSignature({
		value: JSON.stringify([kind, id, title]),
		purpose: "podcast cover urls",
		encoding: "hex",
	})
	return coverHash.slice(0, 32)
}

/**
 * Returns the path that a cover is served at in the given size.
 */
export function toPodcastCoverPath(podcastCover: PodcastCover, size: PodcastCoverSize): string {
	return `/api/podcast-covers/${podcastCover.kind}/${podcastCover.id}/${toPodcastCoverKey(podcastCover)}-${size}.jpg`
}
