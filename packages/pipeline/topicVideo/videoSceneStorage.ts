// Each episode owns one private plan per chapter. Episode removal enumerates the same keys.
import { randomUUID } from "node:crypto"
import { setTimeout as wait } from "node:timers/promises"
import { attachmentExists, getAttachmentBytes, uploadAttachment } from "@carlnotes/db/store"
import { readTopicVideoScenePlansHash, toTopicVideoScenePlanKey } from "@carlnotes/db/topicVideoKeys"
import type { VideoSceneSource } from "./topicVideoImageCheck"
import { withTopicVideoLock } from "./topicVideoLock"
import type { VideoChapterImages, VideoSegmentImage } from "./videoParts"
import {
	checkRetainedScenePictures,
	resolveSavedVideoScenePlan,
	sha256Hash,
	toVideoScenePlansHash,
	type VideoScenePlan,
	verifyVideoScenePlan,
} from "./videoScenePlan"
import type { VideoSegment } from "./videoTimeline"

type Reservation = { plan: VideoScenePlan; until: number; attempt: string }
type PlanDecision =
	| { status: "ready"; plan: VideoScenePlan }
	| { status: "wait" }
	| { status: "select"; reservation: Reservation }
type PlanUpdate<T> = (stored: string | null) => { result: T; save?: VideoScenePlan | Reservation }
const PLANNING_WINDOW_MS = 150_000

/**
 * Reserves one planner call per input and replays its decision for every competing render or retry.
 */
export async function saveVideoScenePlan(
	expected: VideoScenePlan,
	isRetry: boolean,
	selectAnimation?: () => Promise<NonNullable<VideoScenePlan["pictureAnimations"]>>,
	signal?: AbortSignal,
): Promise<VideoScenePlan> {
	// Resolve a completed plan or wait outside the transaction for the render that owns the planner.
	for (;;) {
		signal?.throwIfAborted()
		const decision = await updatePlan<PlanDecision>(expected, (stored) => {
			signal?.throwIfAborted()
			return reserveChapterAnimation(stored, expected, isRetry, !!selectAnimation, Date.now())
		})
		if (decision.status === "ready") {
			return decision.plan
		}
		if (decision.status === "wait") {
			await wait(1000, undefined, { signal })
			continue
		}

		// Save even an empty selection. An abandoned reservation settles on its original montage.
		const reservation = JSON.stringify(decision.reservation)
		try {
			signal?.throwIfAborted()
			const regions = (await selectAnimation?.()) ?? []
			const selected = regions.length
				? verifyVideoScenePlan({ ...expected, pictureAnimations: regions }, expected)
				: expected
			return await updatePlan(expected, (stored) => {
				signal?.throwIfAborted()
				if (stored === reservation) {
					return { result: selected, save: selected }
				}
				if (!stored) {
					throw Error("The episode no longer owns this video scene")
				}
				return { result: verifyVideoScenePlan(JSON.parse(stored), expected) }
			})
		} catch (error) {
			// Release competing renders immediately and preserve any decision another attempt already saved.
			await updatePlan(expected, (stored) => ({
				result: undefined,
				...(stored === reservation ? { save: expected } : {}),
			}))
			throw error
		}
	}
}

/**
 * Resolves a saved selection or elects one render to plan animation for the current chapter.
 */
export function reserveChapterAnimation(
	stored: string | null,
	expected: VideoScenePlan,
	isRetry: boolean,
	canSelect: boolean,
	now: number,
): { result: PlanDecision; save?: VideoScenePlan | Reservation } {
	// A reservation records the original scene images so a retry still detects a removed source.
	let bytes = stored
	let reservation: Partial<Reservation> | null = null
	try {
		const value = stored && JSON.parse(stored)
		if (value?.plan && typeof value.attempt === "string" && Number.isFinite(value.until)) {
			reservation = value
			bytes = JSON.stringify(value.plan)
		}
	} catch {
		// Replace unreadable plans from the authorized scene images.
	}
	const plan = bytes ? resolveSavedVideoScenePlan(bytes, expected, isRetry) : expected
	if (
		reservation?.plan?.episode === expected.episode &&
		reservation.plan.position === expected.position &&
		Number(reservation.until) > now &&
		Number(reservation.until) <= now + PLANNING_WINDOW_MS
	) {
		return { result: { status: "wait" } }
	}
	const alreadySaved = bytes === JSON.stringify(plan)
	// Resolution returns the requested plan itself only when the stored selection needs replacing.
	if (alreadySaved || plan !== expected || (isRetry && bytes)) {
		return { result: { status: "ready", plan }, ...(reservation || !alreadySaved ? { save: plan } : {}) }
	}
	if (!canSelect) {
		return { result: { status: "ready", plan }, save: plan }
	}

	// Commit the reservation before submitting any picture to the model.
	const pending = { plan, until: now + PLANNING_WINDOW_MS, attempt: randomUUID() }
	return { result: { status: "select", reservation: pending }, save: pending }
}

// Serialize only the private object read and write with competing renders and episode removal.
async function updatePlan<T>(expected: VideoScenePlan, update: PlanUpdate<T>): Promise<T> {
	const key = toTopicVideoScenePlanKey(expected.episode, expected.position)
	return withTopicVideoLock(expected.episode, async () => {
		const bytes = (await attachmentExists(key)) ? await getAttachmentBytes(key) : null
		const { result, save } = update(bytes && new TextDecoder().decode(bytes))
		if (save) {
			await uploadAttachment(key, new TextEncoder().encode(JSON.stringify(save)), "application/json")
		}
		return result
	})
}

/**
 * Verifies each stored plan and its source pictures against the hash on the published chapters part.
 */
export async function canReusePublishedVideoChapters(options: {
	episode: string
	chaptersKey: string
	segments: VideoSegment[]
	chapterImages: Map<number, VideoChapterImages>
	sources: VideoSceneSource[]
	posterHash: string | null
	signal?: AbortSignal
}): Promise<boolean> {
	const { episode, chaptersKey, segments, chapterImages, sources, posterHash, signal } = options
	const expected = readTopicVideoScenePlansHash(episode, chaptersKey)
	if (!expected) {
		return false
	}

	// check every plan and its approved pictures in the order their scenes were encoded
	const planHashes: string[] = []
	for (const segment of segments) {
		if (segment.kind === "chapter") {
			const images = chapterImages.get(segment.position)?.images ?? []
			const planHash = await checkStoredChapterPictures(episode, segment.position, images, signal)
			if (!planHash) {
				return false
			}
			planHashes.push(planHash)
		}
	}

	// a plan written by a competing render cannot authorize pixels in the published film
	return toVideoScenePlansHash(planHashes, sources, posterHash) === expected
}

// verify the original resources, generated illustrations and any poster used as fallback artwork
async function checkStoredChapterPictures(
	episode: string,
	position: number,
	images: VideoSegmentImage[],
	signal?: AbortSignal,
): Promise<string | null> {
	const key = toTopicVideoScenePlanKey(episode, position)
	if (!(await attachmentExists(key))) {
		return null
	}
	const stored = await getAttachmentBytes(key)
	const approved = new Set<string>()
	for (const image of images) {
		signal?.throwIfAborted()
		const bytes = image.loadSceneImage ? await image.loadSceneImage() : await image.loadStillPng()
		approved.add(sha256Hash(bytes))
	}
	// malformed plans, unfinished reservations and withdrawn pictures require freshly encoded frames
	try {
		return checkRetainedScenePictures(JSON.parse(new TextDecoder().decode(stored)), episode, position, approved)
	} catch {
		return null
	}
}
