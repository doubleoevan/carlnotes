import type { NoteCommentThread } from "@carlnotes/core/hooks/useNoteComments"

// static threads keep on-device stories independent of signed-in API data
export const NOTE_STORY_THREAD: NoteCommentThread = {
	comments: [
		{
			id: "one",
			body: "A useful finding to revisit.",
			createdAt: "2026-10-20T12:00:00Z",
			author: null,
			canDelete: false,
		},
		{ id: "two", body: "My comment on the note.", createdAt: "2026-10-21T12:00:00Z", author: null, canDelete: true },
	],
	isLoading: false,
	hasError: false,
	retry: () => {},
	postNoteComment: async () => true,
	deleteNoteComment: async () => true,
}
