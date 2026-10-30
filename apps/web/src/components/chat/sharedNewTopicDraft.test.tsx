// the shared new-topic draft: the team a team page gives it, the clear that keeps that team, one upload per file once
// the topic is created, a rejected upload's line, the files a topic cannot keep, and the files let go when the draft
// no longer holds them

import { afterEach, expect, test } from "bun:test"
import type { ChatPage } from "@carlnotes/client/chatClient"
import { type NewTopicDraft, useNewTopicDraft } from "@carlnotes/core/hooks/useNewTopicDraft"
import { act } from "react"
import { renderTestHook } from "@/lib/hookTestHarness"

// each test closes its mounted React environment
const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
	for (const close of cleanups.splice(0)) {
		await close()
	}
})

// a file with the name, type, and size the draft reads
type DraftFile = { name: string; mimeType?: string; byteSize?: number }

// mount the hook with its opened topics, uploads, lines, and released files captured
async function mountNewTopicDraft({
	page = { newTopic: true },
	rejectedFileName,
}: {
	page?: ChatPage
	rejectedFileName?: string
} = {}) {
	const recorded = {
		openedTopicIds: [] as string[],
		uploads: [] as string[],
		lines: [] as string[],
		released: [] as string[],
	}
	const harness = await renderTestHook<NewTopicDraft<DraftFile>>(() =>
		useNewTopicDraft<DraftFile>({
			page,
			openTopic: (topicId) => recorded.openedTopicIds.push(topicId),
			uploadAttachment: async (topicId, attachmentFile) => {
				recorded.uploads.push(`${topicId}/${attachmentFile.name}`)
				if (attachmentFile.name === rejectedFileName) {
					throw new Error("That file is over 10MB.")
				}
			},
			toFileDetails: (attachmentFile) => ({
				mimeType: attachmentFile.mimeType ?? "application/pdf",
				byteSize: attachmentFile.byteSize ?? 1,
			}),
			notify: (line) => recorded.lines.push(line),
			deleteAttachmentFile: (attachmentFile) => recorded.released.push(attachmentFile.name),
		}),
	)
	cleanups.push(harness.close)
	return { harness, recorded }
}

// a team page's chat starts on that team
const TEAM = { teamId: "team-1", name: "Roasters" }

test("a team page's draft starts on that team, and a clear keeps it", async () => {
	const { harness } = await mountNewTopicDraft({ page: { newTopic: true, initialTeam: TEAM } })
	expect(harness.read().topicDraft.team).toEqual(TEAM)
	await act(async () => {
		harness.read().setTopicDraft((topicDraft) => ({ ...topicDraft, name: "Green coffee prices" }))
	})
	await act(async () => {
		harness.read().resetTopicDraft()
	})
	expect(harness.read().topicDraft.name).toBe("")
	expect(harness.read().topicDraft.team).toEqual(TEAM)
})

test("a created topic opens and each file uploads once, with a line for a rejected one", async () => {
	const { harness, recorded } = await mountNewTopicDraft({ rejectedFileName: "big.pdf" })
	await act(async () => {
		harness.read().addTopicDraftAttachmentFiles([{ name: "notes.txt" }, { name: "big.pdf" }])
	})
	await act(async () => {
		await harness.read().openCreatedTopic("topic-1")
	})
	expect(recorded.openedTopicIds).toEqual(["topic-1"])
	expect(recorded.uploads).toEqual(["topic-1/notes.txt", "topic-1/big.pdf"])
	expect(recorded.lines).toEqual(["big.pdf didn't attach. That file is over 10MB."])
	expect(recorded.released).toEqual(["notes.txt", "big.pdf"])
	expect(harness.read().topicDraftAttachmentFiles).toEqual([])
})

test("a removed file, a cleared draft's files, and the files held at close are let go once each", async () => {
	const { harness, recorded } = await mountNewTopicDraft()
	await act(async () => {
		harness.read().addTopicDraftAttachmentFiles([{ name: "a.png" }, { name: "b.png" }])
	})
	await act(async () => {
		harness.read().removeTopicDraftAttachmentFile(0)
	})
	await act(async () => {
		harness.read().resetTopicDraft()
	})
	await act(async () => {
		harness.read().addTopicDraftAttachmentFiles([{ name: "c.png" }])
	})
	await harness.close()
	expect(recorded.released).toEqual(["a.png", "b.png", "c.png"])
})

test("a video or an oversized file stays in the chat and never waits on the topic", async () => {
	const { harness, recorded } = await mountNewTopicDraft()
	await act(async () => {
		harness.read().addTopicDraftAttachmentFiles([
			{ name: "clip.mov", mimeType: "video/quicktime" },
			{ name: "scan.pdf", byteSize: 11 * 1024 * 1024 },
			{ name: "notes.md", mimeType: "text/markdown" },
		])
	})
	expect(harness.read().topicDraftAttachmentFiles.map((file) => file.name)).toEqual(["notes.md"])
	expect(recorded.released).toEqual(["clip.mov", "scan.pdf"])
	expect(recorded.lines).toEqual([
		"clip.mov stays in this chat. A topic can't keep a video.",
		"scan.pdf stays in this chat. That attachment is too large. The limit is 10 MB.",
	])
})
