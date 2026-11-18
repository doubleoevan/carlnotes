// Reserve the film's paid animation before the provider request.
import { setTimeout as wait } from "node:timers/promises"
import { attachmentExists, getAttachmentBytes, uploadAttachment } from "@carlnotes/db/store"
import { toTopicVideoAnimationKeys } from "@carlnotes/db/topicVideoKeys"
import { withTopicVideoLock } from "./topicVideoLock"
import { sha256Hash } from "./videoScenePlan"

type StoredAnimation = {
	sourceImageHash: string
	started: number
	status: "pending" | "skipped" | "ready"
	animationFileHash?: string
}
type ReadAnimation = { kind: "generate" | "wait" | "skip" } | { kind: "reuse" | "recover"; animationFileHash: string }
const MAX_WAIT_MS = 4 * 60_000

/** Resolves an episode's one reservation, including a failed or interrupted generation. */
export function decideGeneratedAnimation(
	stored:
		| (Omit<StoredAnimation, "sourceImageHash"> & { sourceImageHash?: string; asset?: string; digest?: string })
		| null,
	sourceImageHash: string,
	now: number,
	isRetry: boolean,
): ReadAnimation {
	if (!stored) {
		return { kind: isRetry ? "skip" : "generate" }
	}
	if ((stored.sourceImageHash ?? stored.asset) !== sourceImageHash) {
		return { kind: "skip" }
	}
	const animationFileHash = stored.animationFileHash ?? stored.digest
	if (stored.status === "ready" && animationFileHash) {
		return { kind: "reuse", animationFileHash }
	}
	if (stored.status === "pending" && animationFileHash) {
		return { kind: "recover", animationFileHash }
	}
	if (stored.status === "pending" && now - stored.started < MAX_WAIT_MS) {
		return { kind: "wait" }
	}
	return { kind: "skip" }
}

/** Saves one validated silent animation and returns its bytes when the same approved picture recurs. */
export async function loadOrGenerateAnimation(
	episode: string,
	sourceImageHash: string,
	isRetry: boolean,
	generate: () => Promise<Uint8Array | null>,
	signal?: AbortSignal,
): Promise<Uint8Array | null> {
	const keys = toTopicVideoAnimationKeys(episode)
	const reservation: StoredAnimation = { sourceImageHash, started: Date.now(), status: "pending" }
	const write = (value: StoredAnimation): Promise<void> =>
		uploadAttachment(keys.decision, Buffer.from(JSON.stringify(value)), "application/json")

	// Elect one generation under the same row lock as chapter planning and episode removal.
	for (;;) {
		signal?.throwIfAborted()
		const choice = await withTopicVideoLock(episode, async () => {
			const stored: StoredAnimation | null = (await attachmentExists(keys.decision))
				? JSON.parse(new TextDecoder().decode(await getAttachmentBytes(keys.decision)))
				: null
			const decision = decideGeneratedAnimation(stored, sourceImageHash, Date.now(), isRetry)
			if (decision.kind === "generate") {
				await write(reservation)
			}
			return decision
		})
		if (choice.kind === "skip") {
			return null
		}
		if (choice.kind === "reuse" || choice.kind === "recover") {
			return readApprovedAnimation(keys.video, choice, () =>
				withTopicVideoLock(episode, () =>
					write({ ...reservation, status: "ready", animationFileHash: choice.animationFileHash }),
				),
			)
		}
		if (choice.kind === "generate") {
			break
		}
		await wait(1200, undefined, { signal })
	}

	// Keep an interrupted or rejected request spent. A later attempt can reuse a completed video.
	const bytes = await generate().catch(async (error) => {
		await withTopicVideoLock(episode, () => write({ ...reservation, status: "skipped" }))
		throw error
	})
	if (!bytes) {
		await withTopicVideoLock(episode, () => write({ ...reservation, status: "skipped" }))
		return null
	}
	// Persist the approved hash before uploading. A retry can finish a lost acknowledgement without another paid call.
	signal?.throwIfAborted()
	const approved = { ...reservation, animationFileHash: sha256Hash(bytes) }
	await withTopicVideoLock(episode, async () => {
		await write(approved)
		await uploadAttachment(keys.video, bytes, "video/x-matroska")
		await write({ ...approved, status: "ready" })
	})
	return bytes
}

// Recover an interrupted upload only when its bytes match the hash recorded after moderation.
async function readApprovedAnimation(
	key: string,
	choice: { kind: "reuse" | "recover"; animationFileHash: string },
	markReady: () => Promise<void>,
): Promise<Uint8Array | null> {
	if (choice.kind === "recover" && !(await attachmentExists(key))) {
		return null
	}
	const bytes = await getAttachmentBytes(key)
	if (sha256Hash(bytes) !== choice.animationFileHash) {
		throw Error("Stored animation file hash has changed")
	}
	if (choice.kind === "recover") {
		await markReady()
	}
	return bytes
}
