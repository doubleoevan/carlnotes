// the note fixtures: a comment thread from the story people
import type { NoteComment } from "@carlnotes/contracts/notes"
import { STORY_PEOPLE, toStoryProfile } from "../fixtures"

/** Three comments: two from teammates and one of the signed-in story user's own, which they may delete. */
export const STORY_NOTE_COMMENTS: NoteComment[] = [
	{
		id: "comment-1",
		body: "The eval runner is the one to keep. The tracing view pays for itself.",
		createdAt: "2026-09-28T09:12:00.000Z",
		author: toStoryProfile(STORY_PEOPLE[1]),
		canDelete: false,
	},
	{
		id: "comment-2",
		body: "Agreed. Shall we drop the second section?",
		createdAt: "2026-09-29T15:40:00.000Z",
		author: toStoryProfile(STORY_PEOPLE[2]),
		canDelete: false,
	},
	{
		id: "comment-3",
		body: "Dropped it. Have a look.",
		createdAt: "2026-09-30T08:05:00.000Z",
		author: toStoryProfile(STORY_PEOPLE[0]),
		canDelete: true,
	},
]
