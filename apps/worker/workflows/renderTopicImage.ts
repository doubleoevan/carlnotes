// the topic image render workflow: write the scene, then draw and store the image. a failure closes the render row
// and leaves the topic's current image, or its drawn covers, as they were

import { toWorkflowFailureReason } from "@carlnotes/contracts/scanFailure"
import {
	SHORT_WRITE_ATTEMPTS,
	SHORT_WRITE_TIMEOUT_MS,
	TOPIC_IMAGE_RENDER_RETRY_POLICY,
	TOPIC_IMAGE_RENDER_TIMEOUT_MS,
	TOPIC_IMAGE_SCENE_ATTEMPTS,
	TOPIC_IMAGE_SCENE_TIMEOUT_MS,
} from "@carlnotes/pipeline/stageTimeouts"
import { proxyActivities } from "@temporalio/workflow"
import type * as activities from "./renderTopicImageActivities"

// the scene writer fails for good on a spent budget, and retries anything else
const { writeTopicImageSceneForRender } = proxyActivities<typeof activities>({
	startToCloseTimeout: TOPIC_IMAGE_SCENE_TIMEOUT_MS,
	retry: { maximumAttempts: TOPIC_IMAGE_SCENE_ATTEMPTS },
})

// the render fails for good on a rejection or a spent budget, and retries a failure another attempt can fix
const { renderAndStoreTopicImage } = proxyActivities<typeof activities>({
	startToCloseTimeout: TOPIC_IMAGE_RENDER_TIMEOUT_MS,
	retry: TOPIC_IMAGE_RENDER_RETRY_POLICY,
})

// the failure write may retry
const { failTopicImageRender } = proxyActivities<typeof activities>({
	startToCloseTimeout: SHORT_WRITE_TIMEOUT_MS,
	retry: { maximumAttempts: SHORT_WRITE_ATTEMPTS },
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
