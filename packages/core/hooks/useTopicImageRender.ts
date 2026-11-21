// the editor's view of a topic's image while a render is under way: the image as it stands, and the poll that
// replaces it once the render lands

import { showClientError } from "@carlnotes/client/apiClient"
import { fetchTopicImageRender } from "@carlnotes/client/topicImageClient"
import {
	type TopicImageRenderResponse,
	type TopicImageUrls,
	toTopicVideoImageUrls,
} from "@carlnotes/contracts/topicImages"
import { useEffect, useRef, useState } from "react"
import { startLimitedPoll } from "../lib/limitedPoll"
import { TOPIC_IMAGE_RENDER_FAILED_TEXT } from "../lib/topicImageEditor"

// how long the editor waits between reads of a pending render, and how long it polls before it treats the render as
// failed: longer than the worker's attempts and backoffs together
export const TOPIC_IMAGE_RENDER_POLL_MS = 3000
const RENDER_POLL_LIMIT_MS = 20 * 60 * 1000

// the read of the render, and what follows its settling: the render, or null for one that failed to settle in time
type StartTopicImageRenderPollOptions = {
	readRender: () => Promise<TopicImageRenderResponse | null>
	onRenderSettled: (render: TopicImageRenderResponse | null) => void
}

/**
 * Reads a pending render on an interval while the app is focused and online, until it settles or the poll's time
 * limit, which settles it as failed. A failed read waits for the next read. Returns the call that stops the reads, after
 * which a read in flight settles nothing.
 */
export function startTopicImageRenderPoll({
	readRender,
	onRenderSettled,
}: StartTopicImageRenderPollOptions): () => void {
	// the stop ends the reads, and a read in flight settles nothing
	const stopPoll = startLimitedPoll({
		read: async (isStopped) => {
			// a failed read or a render still pending waits for the next read
			const render = await readRender().catch(() => null)
			if (isStopped() || !render || render.status === "pending") {
				return
			}

			// the render settled
			stopPoll()
			onRenderSettled(render)
		},
		pollMs: TOPIC_IMAGE_RENDER_POLL_MS,
		limitMs: RENDER_POLL_LIMIT_MS,
		onLimitReached: () => onRenderSettled(null),
	})
	return stopPoll
}

/**
 * Keeps the editor's image current through a render. watchRender starts polling a render by its id until it succeeds,
 * which replaces the image and calls onImageRendered, or fails, which reports it. A film's render leaves its poster,
 * which replaces the image. replaceImage sets the image at once, for an upload.
 */
export function useTopicImageRender(
	initialImage: TopicImageUrls | null,
	onImageRendered?: () => void,
): {
	image: TopicImageUrls | null
	isRendering: boolean
	watchRender: (renderId: string) => void
	replaceImage: (image: TopicImageUrls | null) => void
} {
	// the image as it stands, and the render under way
	const [image, setImage] = useState(initialImage)
	const [renderId, setRenderId] = useState<string | null>(null)
	const onImageRenderedRef = useRef(onImageRendered)
	onImageRenderedRef.current = onImageRendered

	// poll the pending render one read at a time while the app is focused and online, until the render settles, the
	// poll's time limit passes, another render starts, or the editor closes
	useEffect(() => {
		if (!renderId) {
			return
		}
		return startTopicImageRenderPoll({
			readRender: () => fetchTopicImageRender(renderId),
			onRenderSettled: (render) => {
				// the render settled. a success left an image or a film's poster, and anything else shows an error
				setRenderId(null)
				if (!isRenderedImageInPlace(render)) {
					showClientError(TOPIC_IMAGE_RENDER_FAILED_TEXT)
					return
				}

				// replace the image with the render's, or with a film's poster, and call onImageRendered
				const posterImage = render.posterUrl ? toTopicVideoImageUrls(render.posterUrl) : null
				setImage(render.image ?? posterImage)
				onImageRenderedRef.current?.()
			},
		})
	}, [renderId])
	return { image, isRendering: renderId !== null, watchRender: setRenderId, replaceImage: setImage }
}

// whether a render succeeded and left what it drew: an image, or a film's poster
function isRenderedImageInPlace(render: TopicImageRenderResponse | null): render is TopicImageRenderResponse {
	return render?.status === "succeeded" && Boolean(render.image || render.posterUrl)
}
