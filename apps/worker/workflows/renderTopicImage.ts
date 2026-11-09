// the topic image render workflow: write the scene, then draw and store the image. a failure closes the render row
// and leaves the topic's current image, or its drawn covers, as they were

import { toWorkflowFailureReason } from "@carlnotes/contracts/scanFailure"
import { proxyActivities } from "@temporalio/workflow"
import type * as activities from "./renderTopicImageActivities"

// the scene is one short text call with three attempts
const SCENE_TIMEOUT_MS = 2 * 60 * 1000
const SCENE_ATTEMPTS = 3

// a render's retries back off from 15 seconds, doubling up to five minutes apart, over five attempts
const RENDER_TIMEOUT_MS = 3 * 60 * 1000
const RENDER_RETRY_POLICY = { initialInterval: 15 * 1000, backoffCoefficient: 2, maximumInterval: 5 * 60 * 1000 }
const RENDER_ATTEMPTS = 5

// the failure write is short and idempotent
const WRITE_TIMEOUT_MS = 60 * 1000
const WRITE_ATTEMPTS = 3

// the scene writer fails for good on a spent budget, and retries anything else
const { writeTopicImageSceneForRender } = proxyActivities<typeof activities>({
	startToCloseTimeout: SCENE_TIMEOUT_MS,
	retry: { maximumAttempts: SCENE_ATTEMPTS },
})

// the render fails for good on a rejection or a spent budget, and retries a failure another attempt can fix
const { renderAndStoreTopicImage } = proxyActivities<typeof activities>({
	startToCloseTimeout: RENDER_TIMEOUT_MS,
	retry: { ...RENDER_RETRY_POLICY, maximumAttempts: RENDER_ATTEMPTS },
})

// the failure write may retry
const { failTopicImageRender } = proxyActivities<typeof activities>({
	startToCloseTimeout: WRITE_TIMEOUT_MS,
	retry: { maximumAttempts: WRITE_ATTEMPTS },
})

// the topic, the render row that charges for it, and the owner's image prompt
export type RenderTopicImageWorkflowInput = { topicId: string; renderId: string; imagePrompt?: string }

/**
 * Renders a topic's image end to end, closing the render row as failed on any failure.
 */
export async function renderTopicImageWorkflow({
	renderId,
	imagePrompt,
}: RenderTopicImageWorkflowInput): Promise<void> {
	try {
		// the scene from the topic's own words, steered by the owner's image prompt, which takes the house style's place
		const scene = await writeTopicImageSceneForRender({ renderId, imagePrompt })
		await renderAndStoreTopicImage({ renderId, scene, imagePrompt })
	} catch (error) {
		await failTopicImageRender(renderId, toWorkflowFailureReason(error))
		throw error
	}
}
