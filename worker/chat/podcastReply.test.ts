// the reply to a question asked from the podcast player: its speaker before its text, and its stored answer
import { expect, test } from "bun:test"
import type { MockLanguageModelV4 } from "ai/test"
import type { ChatReplyPart } from "."
import { toFinishStreamPart, toStepsModel, toTextStreamParts } from "./chatModelTestFixtures"
import { streamPodcastReply } from "./podcastReply"

// a model that writes its json reply in the given pieces
function toJsonReplyModel(jsonPieces: string[]): MockLanguageModelV4 {
	return toStepsModel([[...toTextStreamParts("1", jsonPieces), toFinishStreamPart("stop")]])
}

// every part of a podcast reply, its speaker parts, the text that streamed, and the stored answer and speaker
type PodcastReplyParts = {
	replyParts: ChatReplyPart[]
	speakerParts: ChatReplyPart[]
	streamedText: string
	text: string
	speaker?: string
}

// read every part of a podcast reply
async function toReplyParts(jsonPieces: string[]): Promise<PodcastReplyParts> {
	// stream the reply and collect its parts
	const podcastReply = streamPodcastReply({
		model: toJsonReplyModel(jsonPieces),
		system: "answer as the host the question picks",
		messages: [{ role: "user", content: "why does it matter to me?" }],
		telemetryOptions: {},
	})
	const replyParts: ChatReplyPart[] = []
	for await (const replyPart of podcastReply.replyParts) {
		replyParts.push(replyPart)
	}

	// pick out the speaker parts and the streamed text, and wait for the stored answer and speaker
	const speakerParts = replyParts.filter((replyPart) => replyPart.type === "speaker")
	const streamedText = replyParts.flatMap((replyPart) => (replyPart.type === "text" ? [replyPart.text] : [])).join("")
	const { text, speaker } = await podcastReply.completion
	return { replyParts, speakerParts, streamedText, text, speaker }
}

// the speaker streams as soon as its key closes, before any text, and the answer streams as it grows
test("a podcast reply streams its speaker first, then its answer, and stores the answer alone", async () => {
	const { replyParts, speakerParts, streamedText, text, speaker } = await toReplyParts([
		'{"speaker":"co',
		'host","answer":"Because',
		' you follow it."}',
	])
	expect(replyParts[0]).toEqual({ type: "speaker", speaker: "cohost" })
	expect(speakerParts).toHaveLength(1)
	expect(streamedText).toBe("Because you follow it.")
	expect(text).toBe("Because you follow it.")
	expect(speaker).toBe("cohost")
})

// a speaker that is no host is carl's, and a reply that failed its schema keeps the answer that streamed
test("an unknown speaker is carl, and a reply that fails its schema keeps its streamed answer", async () => {
	const { replyParts, text, speaker } = await toReplyParts(['{"speaker":"vienna","answer":"It said 58 dB."}'])
	expect(replyParts[0]).toEqual({ type: "speaker", speaker: "host" })
	expect(text).toBe("It said 58 dB.")
	expect(speaker).toBe("host")
})

// an answer the model writes before its speaker waits for the speaker, so vienna's answer is never spoken as carl's
test("an answer written before its speaker streams once the speaker is named", async () => {
	const { replyParts, speakerParts, streamedText, text, speaker } = await toReplyParts([
		'{"answer":"Because you',
		' follow it.","speaker":"cohost"}',
	])
	expect(replyParts[0]).toEqual({ type: "speaker", speaker: "cohost" })
	expect(speakerParts).toHaveLength(1)
	expect(streamedText).toBe("Because you follow it.")
	expect(text).toBe("Because you follow it.")
	expect(speaker).toBe("cohost")
})

// a speaker written after the answer and split mid-value waits until it is whole, so vienna is never announced as carl
test("a speaker written after its answer and split mid-value is announced once whole", async () => {
	const cohostReply = await toReplyParts(['{"answer":"Because you follow it.","speaker":"', "co", 'host"}'])
	expect(cohostReply.speakerParts).toEqual([{ type: "speaker", speaker: "cohost" }])
	expect(cohostReply.replyParts[0]).toEqual({ type: "speaker", speaker: "cohost" })
	expect(cohostReply.speaker).toBe("cohost")

	// carl's speaker split the same way is announced as carl
	const hostReply = await toReplyParts(['{"answer":"Because you follow it.","speaker":"', "ho", 'st"}'])
	expect(hostReply.speakerParts).toEqual([{ type: "speaker", speaker: "host" }])
	expect(hostReply.speaker).toBe("host")
})

// a speaker after the answer that can no longer become a host is carl's at once, and one that ends unfinished is
// carl's once the stream ends
test("a speaker after its answer that is no host falls back to carl", async () => {
	const invalidReply = await toReplyParts(['{"answer":"It said 58 dB.","speaker":"vi', 'enna"}'])
	expect(invalidReply.replyParts[0]).toEqual({ type: "speaker", speaker: "host" })
	expect(invalidReply.text).toBe("It said 58 dB.")

	// a speaker cut off as the start of a host value is carl's, with the answer after it
	const unfinishedReply = await toReplyParts(['{"answer":"It said 58 dB.","speaker":"co'])
	expect(unfinishedReply.replyParts).toEqual([
		{ type: "speaker", speaker: "host" },
		{ type: "text", text: "It said 58 dB." },
	])
	expect(unfinishedReply.speaker).toBe("host")
})
