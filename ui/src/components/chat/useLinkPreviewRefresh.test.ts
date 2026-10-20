// the link preview refresh: every pending chat turn takes its own cards, so a newer one never strands an older one
import { expect, test } from "bun:test"
import type { ChatLinkPreview, ChatTurnRow } from "@shared/contracts/chat"
import { toTestChatTurn } from "./chatRoomTestFixtures"
import { toLinkPreviewRefresh } from "./useLinkPreviewRefresh"

// a card for a link, as the server stores it
const toLinkPreview = (url: string): ChatLinkPreview => ({
	url,
	title: "a page",
	description: null,
	imagePath: null,
	faviconPath: null,
	youtubeVideoId: null,
})

// the server's chat turn for a question, holding the question's cards
const toServerChatTurn = (question: string, linkPreviews: ChatLinkPreview[]): ChatTurnRow => ({
	question,
	answer: "a latte",
	isSpoken: false,
	speaker: "host",
	podcastEpisodeChapter: null,
	attachments: [],
	linkPreviews,
	answerLinkPreviews: [],
})

// two chat turns wait on cards at once, and the server has both, so both land and both stop waiting
test("toLinkPreviewRefresh fills every pending chat turn", () => {
	const olderChatTurn = toTestChatTurn({
		spokenAnswerKey: "older",
		question: "read https://a.example",
		linkPreviewsPending: true,
	})
	const newerChatTurn = toTestChatTurn({
		spokenAnswerKey: "newer",
		question: "read https://b.example",
		linkPreviewsPending: true,
	})
	const linkPreviewRefresh = toLinkPreviewRefresh({
		chatTurns: [olderChatTurn, newerChatTurn],
		linkPreviewAttempts: new Map([
			["older", 3],
			["newer", 5],
		]),
		serverChatTurns: [
			toServerChatTurn("read https://a.example", [toLinkPreview("https://a.example")]),
			toServerChatTurn("read https://b.example", [toLinkPreview("https://b.example")]),
		],
	})

	// each chat turn shows its own card and is done loading
	expect(linkPreviewRefresh.chatTurns.map((chatTurn) => chatTurn.linkPreviews[0]?.url)).toEqual([
		"https://a.example",
		"https://b.example",
	])
	expect(linkPreviewRefresh.chatTurns.every((chatTurn) => !chatTurn.linkPreviewsPending)).toBe(true)
	expect(linkPreviewRefresh.settledSpokenAnswerKeys).toEqual(["older", "newer"])
})

// a chat turn whose card has not landed keeps waiting until its attempts run out, and one gone from the list settles
test("toLinkPreviewRefresh keeps waiting while attempts remain and settles a chat turn that is gone", () => {
	const pendingChatTurn = toTestChatTurn({
		spokenAnswerKey: "pending",
		question: "read https://a.example",
		linkPreviewsPending: true,
	})
	const linkPreviewRefreshOptions = {
		chatTurns: [pendingChatTurn],
		serverChatTurns: [toServerChatTurn("read https://a.example", [])],
	}

	// with attempts left the chat turn stays pending, and a removed chat turn stops waiting
	const pendingLinkPreviewRefresh = toLinkPreviewRefresh({
		...linkPreviewRefreshOptions,
		linkPreviewAttempts: new Map([
			["pending", 2],
			["removed", 4],
		]),
	})
	expect(pendingLinkPreviewRefresh.chatTurns[0]?.linkPreviewsPending).toBe(true)
	expect(pendingLinkPreviewRefresh.settledSpokenAnswerKeys).toEqual(["removed"])

	// with no attempts left the chat turn stops loading without a card
	const outOfAttemptsLinkPreviewRefresh = toLinkPreviewRefresh({
		...linkPreviewRefreshOptions,
		linkPreviewAttempts: new Map([["pending", 0]]),
	})
	expect(outOfAttemptsLinkPreviewRefresh.chatTurns[0]?.linkPreviewsPending).toBe(false)
	expect(outOfAttemptsLinkPreviewRefresh.settledSpokenAnswerKeys).toEqual(["pending"])
})
