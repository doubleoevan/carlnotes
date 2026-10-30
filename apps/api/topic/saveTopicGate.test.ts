// tests for the topic save gate: a private topic passes unchecked, a stale account is rejected first, a violation is
// named, the tags are classified with the name and prompt, and an unchanged text is not classified again
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import * as moderation from "../moderation"
import * as termsAcceptance from "../termsAcceptance"
import { toTopicSaveRejection } from "./saveTopicGate"

afterEach(() => mock.restore())

// a topic save by one user
const PUBLIC_TOPIC = {
	name: "Coffee",
	prompt: "Everything about beans",
	tags: [] as string[],
	subjectId: "topic-1",
	userId: "user-1",
}

test("a private topic is saved without a check, and a stale account is rejected before the text is classified", async () => {
	const hasAcceptedCurrentTermsSpy = spyOn(termsAcceptance, "hasAcceptedCurrentTerms").mockResolvedValue(false)
	const toObjectionableCategorySpy = spyOn(moderation, "toObjectionableCategory").mockResolvedValue("hate")
	expect(await toTopicSaveRejection({ ...PUBLIC_TOPIC, visibility: "private" })).toBeNull()
	expect(hasAcceptedCurrentTermsSpy).not.toHaveBeenCalled()
	expect(await toTopicSaveRejection({ ...PUBLIC_TOPIC, visibility: "public" })).toEqual({ status: "termsOutdated" })
	expect(toObjectionableCategorySpy).not.toHaveBeenCalled()
})

test("a violation names its category, and an unchanged text is not classified again", async () => {
	spyOn(termsAcceptance, "hasAcceptedCurrentTerms").mockResolvedValue(true)
	const toObjectionableCategorySpy = spyOn(moderation, "toObjectionableCategory").mockResolvedValue("hate")
	expect(await toTopicSaveRejection({ ...PUBLIC_TOPIC, visibility: "invite" })).toEqual({
		status: "objectionable",
		category: "hate",
	})
	expect(toObjectionableCategorySpy).toHaveBeenCalledWith(
		expect.objectContaining({ text: "Coffee\nEverything about beans" }),
	)
	expect(await toTopicSaveRejection({ ...PUBLIC_TOPIC, visibility: "public", isTextChanged: false })).toBeNull()
	expect(toObjectionableCategorySpy).toHaveBeenCalledTimes(1)
})

// a public topic's tags are read in the same one call as its name and prompt
test("a public topic's tags are classified with its name and prompt", async () => {
	spyOn(termsAcceptance, "hasAcceptedCurrentTerms").mockResolvedValue(true)
	const toObjectionableCategorySpy = spyOn(moderation, "toObjectionableCategory").mockResolvedValue("hate")
	const taggedTopic = { ...PUBLIC_TOPIC, tags: ["beans", "a slur"], visibility: "public" as const }
	expect(await toTopicSaveRejection(taggedTopic)).toEqual({ status: "objectionable", category: "hate" })
	expect(toObjectionableCategorySpy).toHaveBeenCalledWith(
		expect.objectContaining({
			text: "Coffee\nEverything about beans\nTags: beans, a slur",
			textKind: "a topic's name, prompt, and tags",
		}),
	)
	expect(toObjectionableCategorySpy).toHaveBeenCalledTimes(1)
})
