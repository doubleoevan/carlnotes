// Only an exact match to reviewed artwork can move a subject inside a film frame.
import { join } from "node:path"
import { PODCAST_CARD_ILLUSTRATION_URL } from "./videoFrames"
import { sha256Hash } from "./videoScenePlan"

const clip = new URL("../assets/film/coffee-break-hosts.webm", import.meta.url)
const hostSourceImageHash = "e79bdfef8a5f7b4b6126b137592d1a2736aae89773a0ef435ad75e3b5673855d"
let hostAnimationPath: Promise<string | undefined> | undefined

/** The steam fits the bundled edition of the Coffee Break illustration. */
export function loadPodcastCardAnimationPath(): Promise<string | undefined> {
	hostAnimationPath ??= Bun.file(PODCAST_CARD_ILLUSTRATION_URL)
		.bytes()
		.then((bytes) => (sha256Hash(bytes) === hostSourceImageHash ? clip.pathname : undefined))
	return hostAnimationPath
}

/** Find reviewed animation for this exact picture. An unreviewed picture keeps its montage shot. */
export async function loadReviewedAnimation(
	image: Uint8Array,
	isHostIllustration: boolean,
): Promise<Uint8Array | null> {
	// The steam follows the cups in this edition of the host illustration.
	if (isHostIllustration) {
		const path = await loadPodcastCardAnimationPath()
		return path ? Bun.file(path).bytes() : null
	}

	// The operator supplies silent loops from a trusted directory. External page data cannot name a file.
	const directory = Bun.env.TOPIC_VIDEO_REVIEWED_ANIMATION_DIR ?? Bun.env.TOPIC_VIDEO_REVIEWED_MOTION_DIR
	if (!directory) {
		return null
	}
	const file = Bun.file(join(directory, `${sha256Hash(image)}.webm`))
	if (!(await file.exists()) || file.size === 0 || file.size > 24 * 1024 * 1024) {
		return null
	}
	return file.bytes()
}
