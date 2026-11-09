// the editor's view of a topic's image while a render is under way: the image as it stands, and the poll that
// replaces it once the render lands

import { showClientError } from "@carlnotes/client/apiClient"
import { fetchTopicImageRender } from "@carlnotes/client/topicImageClient"
import type { TopicImageUrls } from "@carlnotes/contracts/topicImages"
import { useEffect, useState } from "react"
import { TOPIC_IMAGE_RENDER_FAILED_TEXT } from "../lib/topicImageEditor"

// how long the editor waits between reads of a pending render, and how long it polls before it treats the render as
// failed: longer than the worker's attempts and backoffs together
const RENDER_POLL_MS = 3000
const RENDER_POLL_LIMIT_MS = 20 * 60 * 1000

/**
 * Keeps the editor's image current through a render. watchRender starts polling a render by its id until it succeeds,
 * which replaces the image, or fails, which reports it. replaceImage sets the image at once, for an upload.
 */
export function useTopicImageRender(initialImage: TopicImageUrls | null): {
	image: TopicImageUrls | null
	isRendering: boolean
	watchRender: (renderId: string) => void
	replaceImage: (image: TopicImageUrls) => void
} {
	// the image as it stands, and the render under way
	const [image, setImage] = useState(initialImage)
	const [renderId, setRenderId] = useState<string | null>(null)

	// one read at a time per pending render, the next one scheduled once the last returns, until the render settles,
	// another render starts, or the editor closes. a read that returns after its render was replaced changes nothing
	useEffect(() => {
		if (!renderId) {
			return
		}

		// this render's own cancel flag, start time, and next read
		let isCancelled = false
		const pollStartedAt = Date.now()
		let timer: ReturnType<typeof setTimeout> | undefined
		const readRender = async (): Promise<void> => {
			// a read that failed or a render still pending waits for the next read, until the poll's limit
			const render = await fetchTopicImageRender(renderId).catch(() => null)
			const isPastLimit = Date.now() - pollStartedAt > RENDER_POLL_LIMIT_MS
			if (isCancelled) {
				return
			}

			// the next read, while the render is still pending
			if ((!render || render.status === "pending") && !isPastLimit) {
				timer = setTimeout(() => void readRender(), RENDER_POLL_MS)
				return
			}

			// the render settled: a success replaces the image, and a failure says so
			setRenderId(null)
			if (render?.status === "succeeded" && render.image) {
				setImage(render.image)
			} else {
				showClientError(TOPIC_IMAGE_RENDER_FAILED_TEXT)
			}
		}
		timer = setTimeout(() => void readRender(), RENDER_POLL_MS)

		// the editor closed or another render started
		return () => {
			isCancelled = true
			clearTimeout(timer)
		}
	}, [renderId])
	return { image, isRendering: renderId !== null, watchRender: setRenderId, replaceImage: setImage }
}
