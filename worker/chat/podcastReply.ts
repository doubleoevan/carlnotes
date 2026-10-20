// the reply to a question asked from the podcast player: one structured model call whose speaker, carl or vienna,
// streams before the answer, so choosing who answers adds no wait

import { isPodcastEpisodeSpeaker, type PodcastEpisodeSpeaker, podcastEpisodeSpeakers } from "@shared/enums"
import {
	type LanguageModel,
	type ModelMessage,
	Output,
	parsePartialJson,
	streamText,
	type TextStreamPart,
	type ToolSet,
} from "ai"
import { z } from "zod"
import type { ChatReplyCompletion, ChatReplyPart, ChatReplyStream } from "."

// what the model returns on a podcast chat turn: who answers, written first, then what they say
const podcastReplySchema = z.object({ speaker: z.enum(podcastEpisodeSpeakers), answer: z.string() })

// the most a podcast chat turn's answer may write. it is spoken, so it is short
const MAX_PODCAST_REPLY_OUTPUT_TOKENS = 1000

// the model call's inputs: the model, the system prompt, the conversation, and the prompt's telemetry options
type StreamPodcastReplyOptions = {
	model: LanguageModel
	system: string
	messages: ModelMessage[]
	telemetryOptions: Pick<Parameters<typeof streamText>[0], "runtimeContext" | "telemetry">
}

// what the stream has read so far: the json the model wrote, the host once the speaker key closed, and the answer
type PodcastReplyProgress = { jsonText: string; speaker: PodcastEpisodeSpeaker | null; answer: string }

/**
 * Streams a podcast chat turn's reply: the speaker part first, then the answer's text as it grows, with no tools. The
 * completion's text is the answer alone, never the json.
 */
export function streamPodcastReply({
	model,
	system,
	messages,
	telemetryOptions,
}: StreamPodcastReplyOptions): ChatReplyStream {
	const replyStream = streamText({
		model,
		system,
		messages,
		output: Output.object({ schema: podcastReplySchema }),
		maxOutputTokens: MAX_PODCAST_REPLY_OUTPUT_TOKENS,
		...telemetryOptions,
	})

	// the parts read the stream and keep their progress, which the completion reads once the parts are all read
	const podcastReplyProgress: PodcastReplyProgress = { jsonText: "", speaker: null, answer: "" }
	const replyPartsRead = Promise.withResolvers<void>()
	const replyParts = withReadSignal(
		toPodcastReplyParts(replyStream.stream, podcastReplyProgress),
		replyPartsRead.resolve,
	)
	const completion = toPodcastReplyCompletion(replyStream, podcastReplyProgress, replyPartsRead.promise)
	completion.catch(() => {})
	return { replyParts, completion }
}

// the reply parts, calling onRead once every part is read or the reading stops
async function* withReadSignal(
	replyParts: AsyncGenerator<ChatReplyPart>,
	onRead: () => void,
): AsyncGenerator<ChatReplyPart> {
	try {
		yield* replyParts
	} finally {
		onRead()
	}
}

// the speaker, then each piece of the answer as it grows, read from the model's json. an answer the model writes
// before its speaker waits for the speaker, and a reply that never names one is carl's
async function* toPodcastReplyParts(
	modelStream: AsyncIterable<TextStreamPart<ToolSet>>,
	podcastReplyProgress: PodcastReplyProgress,
): AsyncGenerator<ChatReplyPart> {
	let answer = ""
	for await (const streamPart of modelStream) {
		// throw an error part. the full stream yields one instead of throwing
		if (streamPart.type === "error") {
			throw streamPart.error
		}
		if (streamPart.type !== "text-delta") {
			continue
		}

		// read the json so far, and write the speaker before any of the answer
		podcastReplyProgress.jsonText += streamPart.text
		const partialReply = await toPartialPodcastReply(podcastReplyProgress.jsonText)
		answer = partialReply.answer ?? answer
		const streamedSpeaker = podcastReplyProgress.speaker === null ? toStreamedSpeaker(partialReply) : null
		if (streamedSpeaker) {
			podcastReplyProgress.speaker = streamedSpeaker
			yield { type: "speaker", speaker: streamedSpeaker }
		}

		// write what the answer grew by, once the speaker is written
		const answerGrowth = takeAnswerGrowth(podcastReplyProgress, answer)
		if (answerGrowth) {
			yield answerGrowth
		}
	}

	// a reply that never named its speaker is carl's
	if (podcastReplyProgress.speaker === null) {
		podcastReplyProgress.speaker = "host"
		yield { type: "speaker", speaker: "host" }
	}

	// the answer that waited for the speaker follows
	const answerGrowth = takeAnswerGrowth(podcastReplyProgress, answer)
	if (answerGrowth) {
		yield answerGrowth
	}
}

// the host that the json so far names, carl if the speaker can no longer become a host and the answer has started,
// or null while the speaker is not known yet
function toStreamedSpeaker({
	speaker,
	isSpeakerUnfinished,
	answer,
}: PartialPodcastReply): PodcastEpisodeSpeaker | null {
	if (isPodcastEpisodeSpeaker(speaker)) {
		return speaker
	}
	return speaker !== undefined && !isSpeakerUnfinished && answer !== undefined ? "host" : null
}

// take what the answer grew by since the last part, and record the answer in the progress, or take nothing before
// the speaker is written or with no new words
function takeAnswerGrowth(podcastReplyProgress: PodcastReplyProgress, answer: string): ChatReplyPart | null {
	if (podcastReplyProgress.speaker === null || answer.length <= podcastReplyProgress.answer.length) {
		return null
	}
	const answerGrowth = answer.slice(podcastReplyProgress.answer.length)
	podcastReplyProgress.answer = answer
	return { type: "text", text: answerGrowth }
}

// the json so far as a partial reply, with a key the model has not written yet left out, and whether the model may
// still be writing the speaker
type PartialPodcastReply = { speaker?: unknown; isSpeakerUnfinished?: boolean; answer?: string }

// read the json so far as a partial reply
async function toPartialPodcastReply(jsonText: string): Promise<PartialPodcastReply> {
	const { value } = await parsePartialJson(jsonText)
	if (typeof value !== "object" || value === null) {
		return {}
	}

	// keep the answer only once it is text. the speaker may still grow into a host while it is the json's last key and
	// the start of a host value
	const { speaker, answer } = value as Record<string, unknown>
	const isSpeakerUnfinished =
		Object.keys(value).at(-1) === "speaker" &&
		typeof speaker === "string" &&
		podcastEpisodeSpeakers.some((podcastEpisodeSpeaker) => podcastEpisodeSpeaker.startsWith(speaker))
	return { speaker, isSpeakerUnfinished, answer: typeof answer === "string" ? answer : undefined }
}

// the finished reply: the validated answer, or what streamed if the json failed its schema, under the speaker already
// sent, and its tokens
async function toPodcastReplyCompletion(
	replyStream: {
		usage: PromiseLike<{ totalTokens?: number }>
		output: PromiseLike<z.infer<typeof podcastReplySchema>>
	},
	podcastReplyProgress: PodcastReplyProgress,
	replyPartsRead: Promise<void>,
): Promise<ChatReplyCompletion> {
	// the progress is whole only once the parts are all read. a reply that failed its schema has no parsed reply
	const [usage, parsedReply] = await Promise.all([
		replyStream.usage,
		Promise.resolve(replyStream.output).catch(() => null),
		replyPartsRead,
	])

	// keep the speaker already sent, and the answer that streamed if the json failed its schema
	const text = (parsedReply?.answer ?? podcastReplyProgress.answer).trim()
	const speaker = podcastReplyProgress.speaker ?? parsedReply?.speaker ?? "host"
	return { text, speaker, totalTokens: usage.totalTokens ?? 0, searchCount: 0, toolCalls: [] }
}
