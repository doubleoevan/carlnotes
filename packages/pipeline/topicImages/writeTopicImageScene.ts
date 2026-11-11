// the scene writer: the cheap text model that writes the one- or two-sentence scene a topic's image is drawn from,
// and the image prompt that puts the house style after it

import { TOPIC_IMAGE_PROMPT_CHARS } from "@carlnotes/contracts/topicImages"
import { cheapModel } from "@carlnotes/models/models"
import {
	type BuiltPrompt,
	fetchPromptTemplate,
	type PromptName,
	promptTelemetry,
} from "@carlnotes/models/prompts/fetch"
import { writePrompt } from "@carlnotes/models/prompts/write"
import { generateText } from "ai"

// the most tags and finding titles one prompt holds, and the characters each line keeps
const MAX_SCENE_TAGS = 10
export const MAX_SCENE_FINDING_TITLES = 5
const MAX_SCENE_LINE_CHARS = 200
const MAX_SCENE_PROMPT_CHARS = 1_000

// the longest scene the writer may return, and the output limit that leaves it room after a reasoning model thinks
const MAX_SCENE_CHARS = 600
const MAX_SCENE_OUTPUT_TOKENS = 2_048

// the framings a scene may take, one picked at random for each render
export const TOPIC_IMAGE_FRAMINGS = [
	"a wide landscape with the focal subject small in a big setting",
	"a close-up that fills the frame with one detail",
	"a view from high above, looking down",
	"a low angle, looking up at the focal subject",
	"a side view at eye level, the focal subject in motion",
	"a busy scene in the middle of its activity, full of movement",
	"a scene at dusk or night, lit by one warm light",
	"a scene in weather: rain, snow, fog, or wind",
]

// how long the writer's model call may take before it aborts
const SCENE_TIMEOUT_MS = 30 * 1000

// what a scene is written from: the topic's name, its prompt, its tags, its newest finding titles, the owner's image
// prompt, and the framing, which a test passes and a render leaves out for a random one
export type TopicImageSceneInput = {
	topicName: string
	topicPrompt: string
	tags: string[]
	findingTitles: string[]
	imagePrompt?: string
	framing?: string
}

/**
 * Builds the scene prompt, with every topic field and the owner's image prompt fenced as untrusted and limited in count and length,
 * and the framing given or picked at random.
 */
export async function buildTopicImageScenePrompt(sceneInput: TopicImageSceneInput): Promise<BuiltPrompt> {
	const { template, registryPrompt } = await fetchPromptTemplate("topic-image-scene")
	const framing = sceneInput.framing ?? pickTopicImageFraming()
	const prompt = writePrompt(
		template,
		{
			topicName: sceneInput.topicName.slice(0, MAX_SCENE_LINE_CHARS),
			topicPrompt: sceneInput.topicPrompt.slice(0, MAX_SCENE_PROMPT_CHARS),
			tags: toPromptLines(sceneInput.tags, MAX_SCENE_TAGS),
			findingTitles: toPromptLines(sceneInput.findingTitles, MAX_SCENE_FINDING_TITLES),
			imagePrompt: sceneInput.imagePrompt?.trim().slice(0, TOPIC_IMAGE_PROMPT_CHARS) || "(none)",
		},
		{ framing },
	)
	return { prompt, name: "topic-image-scene", registryPrompt }
}

/**
 * Writes one scene on the cheap model, billed to the given key. Throws an error on an empty result.
 */
export async function writeTopicImageScene({
	litellmApiKey,
	...sceneInput
}: TopicImageSceneInput & { litellmApiKey?: string }): Promise<string> {
	const scenePrompt = await buildTopicImageScenePrompt(sceneInput)
	const { text } = await generateText({
		model: cheapModel(litellmApiKey),
		prompt: scenePrompt.prompt,
		maxOutputTokens: MAX_SCENE_OUTPUT_TOKENS,
		maxRetries: 0,
		abortSignal: AbortSignal.timeout(SCENE_TIMEOUT_MS),
		...promptTelemetry(scenePrompt),
	})

	// an empty scene is a failed call
	const scene = text.trim().replace(/\s+/g, " ").slice(0, MAX_SCENE_CHARS)
	if (!scene) {
		throw new Error("the scene writer returned nothing")
	}
	return scene
}

/**
 * Returns the image prompt: the scene, then the house style paragraph of the named prompt, which is the topic image's
 * if none is named. The image model sees nothing else.
 */
export async function toTopicImagePrompt(
	scene: string,
	stylePromptName: PromptName = "topic-image-style",
): Promise<string> {
	const { template } = await fetchPromptTemplate(stylePromptName)
	return `${scene}\n\n${writePrompt(template, {})}`
}

// one framing at random
function pickTopicImageFraming(): string {
	return TOPIC_IMAGE_FRAMINGS[Math.floor(Math.random() * TOPIC_IMAGE_FRAMINGS.length)] ?? "a wide landscape"
}

// the lines one field holds, each cut to the line length and the list cut to the count, or (none) for an empty list
function toPromptLines(lines: string[], maxLines: number): string {
	const keptLines = lines
		.map((line) => line.trim().slice(0, MAX_SCENE_LINE_CHARS))
		.filter(Boolean)
		.slice(0, maxLines)
	return keptLines.length > 0 ? keptLines.map((line) => `- ${line}`).join("\n") : "(none)"
}
