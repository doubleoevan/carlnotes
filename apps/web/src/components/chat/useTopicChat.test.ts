// the asked question test: a retry re-asks only a stored question's words, without its podcast episode note or its
// attachment note
import { expect, test } from "bun:test"
import { withAttachmentNote, withPodcastEpisodeNote } from "@carlnotes/contracts/chatQuestionNotes"
import { TEST_PODCAST_EPISODE_NOTE } from "@carlnotes/contracts/chatTestFixtures"
import { toAskedQuestion } from "./useTopicChat"

// a question asked from the podcast player re-asks without the note naming its podcast episode
test("toAskedQuestion drops a podcast episode note", () => {
	const storedQuestion = withPodcastEpisodeNote("what did he mean by that?", TEST_PODCAST_EPISODE_NOTE)
	expect(toAskedQuestion(storedQuestion)).toBe("what did he mean by that?")
})

// a question sent with files re-asks without the note naming them
test("toAskedQuestion drops an attachment note", () => {
	const storedQuestion = withAttachmentNote("what is this?", [{ name: "a.png" }, { name: "b.md" }])
	expect(toAskedQuestion(storedQuestion)).toBe("what is this?")
})

// a stored question ends with the attachment note and then the podcast episode note, and both are dropped
test("toAskedQuestion drops a podcast episode note and the attachment note before it", () => {
	const storedQuestion = withPodcastEpisodeNote(
		withAttachmentNote("why?", [{ name: "a.png" }]),
		TEST_PODCAST_EPISODE_NOTE,
	)
	expect(toAskedQuestion(storedQuestion)).toBe("why?")
})

// a typed question with no note is asked as it is
test("toAskedQuestion keeps a question with no note", () => {
	expect(toAskedQuestion("who is hiring?")).toBe("who is hiring?")
})
