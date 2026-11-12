// a Resource's images for the films that narrate it: read from storage, or fetched once under each version of the image
// filter from the Markdown the Scan stored for the Resource's page and from the page's link preview image. every fetch
// goes through the public url guard, and an unsafe Resource has none

import { db } from "@carlnotes/db"
import { runWithJobLease } from "@carlnotes/db/jobLease"
import { resourceImages, resources } from "@carlnotes/db/schema/scans"
import {
	clearPendingObjectDeletion,
	deleteStoredObjects,
	getResourceContent,
	recordPendingObjectDeletionBeforeUpload,
	recordPendingObjectDeletions,
	toResourceImageKey,
	uploadAttachment,
} from "@carlnotes/db/store"
import { classifyImage } from "@carlnotes/models/moderation"
import { runWithConcurrency } from "@carlnotes/server/concurrency"
import { reportError } from "@carlnotes/server/monitoring"
import { and, asc, eq, inArray } from "drizzle-orm"
import { toImageDataUri } from "../cardElementPng"
import { fetchResourceImageCandidate, loadLinkPreviewImageCandidate } from "./fetchResourceImageCandidates"
import { toResourceImageCandidateUrls } from "./resourceImageCandidates"
import {
	addResourceImage,
	type KeptResourceImage,
	RESOURCE_IMAGE_FILTER_VERSION,
	RESOURCE_IMAGE_LIMIT,
	type ResourceImageCandidate,
	toStoredResourceImageJpeg,
} from "./resourceImageFilter"

// how many of a page's images are fetched at once
const RESOURCE_IMAGE_FETCH_CONCURRENCY = 4

// how long a film waits for another film's fetch of the same Resource, and how often it looks
const RESOURCE_IMAGE_FETCH_WAIT_MS = 30_000
const RESOURCE_IMAGE_FETCH_POLL_MS = 2_000

// how many Resources are fetched at once
const NARRATED_RESOURCE_CONCURRENCY = 3

// one stored image of a Resource as a film reads it: its object key, its stored pixel size, and whether it is the
// page's link preview image
export type ResourceImage = { objectKey: string; width: number; height: number; isLinkPreviewImage: boolean }

// a Resource as its fetch reads it
type NarratedResource = {
	id: string
	url: string
	isUnsafe: boolean
	contentKey: string | null
	imagesFilterVersion: number
}

// whether a Resource's images were fetched under the current version of the image filter. a Resource never fetched
// has version 0
function isFetchedUnderCurrentFilter({ imagesFilterVersion }: Pick<NarratedResource, "imagesFilterVersion">): boolean {
	return imagesFilterVersion >= RESOURCE_IMAGE_FILTER_VERSION
}

/**
 * Returns each Resource's stored images by resource id, in their stored order, fetching them first for a Resource
 * whose fetch has not run under the current image filter. An unsafe Resource has none, and any image stored for it is deleted. A fetch that fails
 * is reported, returns no image, and runs again on the next call. Throws the signal's reason once it is aborted.
 */
export async function loadOrFetchResourceImages(
	resourceIds: string[],
	signal?: AbortSignal,
): Promise<Map<string, ResourceImage[]>> {
	// no Resource reads nothing
	const resourceImagesById = new Map<string, ResourceImage[]>()
	const distinctResourceIds = [...new Set(resourceIds)]
	if (distinctResourceIds.length === 0) {
		return resourceImagesById
	}

	// the Resources, and the images already stored for them
	const narratedResources: NarratedResource[] = await db
		.select({
			id: resources.id,
			url: resources.url,
			isUnsafe: resources.isUnsafe,
			contentKey: resources.contentKey,
			imagesFilterVersion: resources.imagesFilterVersion,
		})
		.from(resources)
		.where(inArray(resources.id, distinctResourceIds))
	const storedResourceImages = await loadStoredResourceImages(distinctResourceIds)

	// settle a few Resources at once
	await runWithConcurrency(narratedResources, NARRATED_RESOURCE_CONCURRENCY, async (narratedResource) => {
		const storedImages = storedResourceImages.get(narratedResource.id) ?? []
		const settledImages = await settleResourceImages({ narratedResource, storedImages, signal })
		resourceImagesById.set(narratedResource.id, settledImages)
	})
	return resourceImagesById
}

// a Resource, the images stored for it, and the signal that stops its fetch
type SettleResourceImagesOptions = {
	narratedResource: NarratedResource
	storedImages: ResourceImage[]
	signal?: AbortSignal
}

// one Resource's images: none for an unsafe Resource, the stored ones if its fetch ran under the current filter, or
// else the ones fetched now
async function settleResourceImages({
	narratedResource,
	storedImages,
	signal,
}: SettleResourceImagesOptions): Promise<ResourceImage[]> {
	// an unsafe Resource shows no image, and loses any stored for it
	if (narratedResource.isUnsafe) {
		await deleteResourceImages(narratedResource.id, storedImages)
		return []
	}
	if (isFetchedUnderCurrentFilter(narratedResource)) {
		return storedImages
	}

	// one film fetches a Resource at a time, and a film that finds another one fetching waits for what it stores. a
	// failed fetch is reported, and the next call fetches again. a stopped one throws
	try {
		const fetchedImages = await runWithJobLease({
			jobName: `resource-images-${narratedResource.id}`,
			runTask: () => fetchResourceImages(narratedResource, signal),
		})
		return fetchedImages ?? (await waitForFetchedResourceImages(narratedResource.id, signal))
	} catch (error) {
		signal?.throwIfAborted()
		reportError(error, "topic-podcast-episode-video", { resourceId: narratedResource.id, step: "resource-images" })
		return []
	}
}

// a fetched Resource's stored images, or null for a Resource whose fetch has not run under the current filter
async function loadFetchedResourceImages(resourceId: string): Promise<ResourceImage[] | null> {
	const [resource] = await db
		.select({ imagesFilterVersion: resources.imagesFilterVersion })
		.from(resources)
		.where(eq(resources.id, resourceId))
	if (!resource || !isFetchedUnderCurrentFilter(resource)) {
		return null
	}

	// the images its fetch stored
	return (await loadStoredResourceImages([resourceId])).get(resourceId) ?? []
}

// wait for another film's fetch of a Resource to finish, and return what it stored, or no image if the wait runs out
async function waitForFetchedResourceImages(resourceId: string, signal?: AbortSignal): Promise<ResourceImage[]> {
	for (let waitedMs = 0; waitedMs < RESOURCE_IMAGE_FETCH_WAIT_MS; waitedMs += RESOURCE_IMAGE_FETCH_POLL_MS) {
		// look again after a pause, unless the render was stopped
		signal?.throwIfAborted()
		await Bun.sleep(RESOURCE_IMAGE_FETCH_POLL_MS)
		const fetchedImages = await loadFetchedResourceImages(resourceId)
		if (fetchedImages) {
			return fetchedImages
		}
	}

	// the other film's fetch took too long
	return []
}

// the stored images of some Resources, by resource id, in their stored order
async function loadStoredResourceImages(resourceIds: string[]): Promise<Map<string, ResourceImage[]>> {
	// read the rows by Resource, then by position
	const resourceImageRows = await db
		.select({
			resourceId: resourceImages.resourceId,
			objectKey: resourceImages.objectKey,
			width: resourceImages.width,
			height: resourceImages.height,
			isLinkPreviewImage: resourceImages.isLinkPreviewImage,
		})
		.from(resourceImages)
		.where(inArray(resourceImages.resourceId, resourceIds))
		.orderBy(asc(resourceImages.resourceId), asc(resourceImages.position))

	// group the rows by their Resource
	const storedResourceImages = new Map<string, ResourceImage[]>()
	for (const { resourceId, ...resourceImage } of resourceImageRows) {
		storedResourceImages.set(resourceId, [...(storedResourceImages.get(resourceId) ?? []), resourceImage])
	}
	return storedResourceImages
}

// delete a Resource's image rows and their stored objects. the keys are recorded as pending deletions with the rows'
// delete, so a failed object delete is tried again
async function deleteResourceImages(resourceId: string, storedImages: ResourceImage[]): Promise<void> {
	if (storedImages.length === 0) {
		return
	}

	// record the keys with the rows' delete, then delete the objects
	const objectKeys = storedImages.map((storedImage) => storedImage.objectKey)
	await db.transaction(async (transaction) => {
		await recordPendingObjectDeletions({ handle: transaction, objectKeys })
		await transaction.delete(resourceImages).where(eq(resourceImages.resourceId, resourceId))
	})
	await deleteStoredObjects(objectKeys)
}

// fetch one Resource's images: the ones its stored Markdown shows, then its link preview image, filtered and stored
async function fetchResourceImages(narratedResource: NarratedResource, signal?: AbortSignal): Promise<ResourceImage[]> {
	// a fetch that finished before this one took the lease has stored the Resource's images
	const fetchedImages = await loadFetchedResourceImages(narratedResource.id)
	if (fetchedImages) {
		return fetchedImages
	}

	// delete the images that an older filter version kept
	const olderImages = (await loadStoredResourceImages([narratedResource.id])).get(narratedResource.id) ?? []
	await deleteResourceImages(narratedResource.id, olderImages)

	// the images the page's own content shows, in the page's order
	const markdown = await loadResourceMarkdown(narratedResource)
	const candidateUrls = toResourceImageCandidateUrls(markdown, narratedResource.url)

	// fetch a few at once and filter them in, until enough are kept or the fetch is stopped
	let keptResourceImages: KeptResourceImage[] = []
	for (let i = 0; i < candidateUrls.length; i += RESOURCE_IMAGE_FETCH_CONCURRENCY) {
		signal?.throwIfAborted()
		if (keptResourceImages.length >= RESOURCE_IMAGE_LIMIT) {
			break
		}

		// fetch the next few, and filter them in the page's order
		const fetchedUrls = candidateUrls.slice(i, i + RESOURCE_IMAGE_FETCH_CONCURRENCY)
		const fetchedCandidates = await Promise.all(fetchedUrls.map(fetchResourceImageCandidate))
		keptResourceImages = await addResourceImages(keptResourceImages, fetchedCandidates)
	}

	// the link preview image passes the same filter, and goes first if the content does not show it
	const linkPreviewImageCandidate = await loadLinkPreviewImageCandidate(narratedResource.url)
	keptResourceImages = await addResourceImages(keptResourceImages, [linkPreviewImageCandidate])
	signal?.throwIfAborted()
	return storeResourceImages(narratedResource.id, keptResourceImages.slice(0, RESOURCE_IMAGE_LIMIT))
}

// filter fetched candidates into the kept images, in order, skipping a fetch that failed
async function addResourceImages(
	keptResourceImages: KeptResourceImage[],
	candidates: (ResourceImageCandidate | null)[],
): Promise<KeptResourceImage[]> {
	// add each fetched candidate in the page's order
	let nextKeptResourceImages = keptResourceImages
	for (const candidate of candidates) {
		if (candidate) {
			nextKeptResourceImages = await addResourceImage(nextKeptResourceImages, candidate)
		}
	}
	return nextKeptResourceImages
}

// the Markdown the Scan stored for a Resource's page, in object storage or on its row, or no text for a Resource with
// none. a read that fails throws an error, so the fetch is not recorded without the page's images
async function loadResourceMarkdown({ id, contentKey }: NarratedResource): Promise<string> {
	if (contentKey) {
		return getResourceContent(contentKey)
	}
	const [resource] = await db.select({ content: resources.content }).from(resources).where(eq(resources.id, id))
	return resource?.content ?? ""
}

// store a Resource's kept images under their positions, and record that its fetch ran
async function storeResourceImages(
	resourceId: string,
	keptResourceImages: KeptResourceImage[],
): Promise<ResourceImage[]> {
	// each kept image as the jpeg a film reads, without one that the image moderation rejects
	const fetchedImages: FetchedResourceImage[] = []
	for (const { imageBytes, sourceUrl, isLinkPreviewImage } of keptResourceImages) {
		const storedJpeg = await toStoredResourceImageJpeg(imageBytes)
		if (await isResourceImageAllowed(storedJpeg.jpegBytes)) {
			const objectKey = toResourceImageKey(resourceId, fetchedImages.length)
			fetchedImages.push({ ...storedJpeg, objectKey, sourceUrl, isLinkPreviewImage })
		}
	}

	// upload each image under its position, then record the fetch with its rows in one short transaction
	await uploadFetchedResourceImages(fetchedImages)
	const resourceImageRows = fetchedImages.map(({ jpegBytes, ...fetchedImage }, position) => ({
		resourceId,
		position,
		...fetchedImage,
	}))
	const isFetchRecorded = await db.transaction(async (transaction) => {
		// record the fetch, unless the Resource was judged unsafe while its images were fetched
		const isSafe = and(eq(resources.id, resourceId), eq(resources.isUnsafe, false))
		const recordedRows = await transaction
			.update(resources)
			.set({ imagesFetchedAt: new Date(), imagesFilterVersion: RESOURCE_IMAGE_FILTER_VERSION })
			.where(isSafe)
			.returning({ id: resources.id })

		// an unsafe Resource records nothing
		if (recordedRows.length === 0) {
			return false
		}

		// the uploaded keys now belong to the Resource
		for (const { objectKey } of fetchedImages) {
			await clearPendingObjectDeletion(objectKey, transaction)
		}
		if (resourceImageRows.length > 0) {
			await transaction.insert(resourceImages).values(resourceImageRows)
		}
		return true
	})

	// a Resource judged unsafe shows no image, and its uploads stay pending deletion
	if (!isFetchRecorded) {
		return []
	}
	return fetchedImages.map(({ jpegBytes, sourceUrl, ...resourceImage }) => resourceImage)
}

// a kept image as its fetch stores it: the jpeg, its object key, its pixel size, the url it was fetched from, and
// whether it is the page's link preview image
type FetchedResourceImage = ResourceImage & { jpegBytes: Uint8Array; sourceUrl: string }

// upload a fetch's images, each with its pending deletion recorded first, which the fetch's record clears. the
// ones already uploaded are deleted if one upload fails
async function uploadFetchedResourceImages(fetchedImages: FetchedResourceImage[]): Promise<void> {
	const uploadedObjectKeys: string[] = []
	try {
		// record each key before its upload
		for (const { objectKey, jpegBytes } of fetchedImages) {
			await recordPendingObjectDeletionBeforeUpload(objectKey)
			await uploadAttachment(objectKey, jpegBytes, "image/jpeg")
			uploadedObjectKeys.push(objectKey)
		}
	} catch (error) {
		// a failed upload leaves no image of this fetch behind
		await deleteStoredObjects(uploadedObjectKeys).catch(() => {})
		throw error
	}
}

// whether a kept image may be shown: the image moderation found no violation, or it was skipped with no moderation key
// set. an image the moderation cannot read is left out, and a failed check fails the fetch, which the next call runs
// again
async function isResourceImageAllowed(jpegBytes: Uint8Array): Promise<boolean> {
	const classification = await classifyImage({ dataUrl: toImageDataUri(jpegBytes, "image/jpeg") })
	if (classification.outcome === "failed") {
		throw classification.error
	}

	// a skipped check and a passed one let the image through
	return (
		classification.outcome === "skipped" ||
		(classification.outcome === "classified" && !classification.verdict.isViolation)
	)
}
