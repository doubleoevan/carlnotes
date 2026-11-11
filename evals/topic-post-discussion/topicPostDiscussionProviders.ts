// the Topic Post Discussion eval's promptfoo provider, which runs the script writer under test

import { toTranscriptTurn } from "@carlnotes/contracts/podcastEpisodes"
import { writeTopicPostDiscussion } from "@carlnotes/pipeline/topicPosts/topicPostDiscussionScript"
import type { ApiProvider, CallApiContextParams, ProviderResponse } from "promptfoo"
import type { TopicPostDiscussionCase } from "./topicPostDiscussionCases"

// the variables that a case gives the writer
type TopicPostDiscussionVariables = Pick<
	TopicPostDiscussionCase,
	"title" | "html" | "authorUsername" | "comments" | "hint"
>

// the writer under test. its output is the script as a transcript, one turn to a line
export const topicPostDiscussionWriter: ApiProvider = {
	id: () => "topic-post-discussion-writer",
	callApi: writeCaseDiscussion,
}

// write one case's script through the app's own writer, with its checks and its retries
async function writeCaseDiscussion(_renderedPrompt: string, context?: CallApiContextParams): Promise<ProviderResponse> {
	const topicPostDiscussionVariables = context?.vars as TopicPostDiscussionVariables
	const { title, html, authorUsername, comments, hint } = topicPostDiscussionVariables
	const { turns } = await writeTopicPostDiscussion({
		title,
		html,
		authorUsername: authorUsername ?? null,
		comments,
		hint,
	})
	const transcriptLines = turns.map(toTranscriptTurn).map(({ speakerName, text }) => `${speakerName}: ${text}`)
	return { output: transcriptLines.join("\n") }
}
