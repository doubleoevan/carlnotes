// sanitized provider-shaped exports and malicious archive fixtures never leave this process
import { expect, test } from "bun:test"
import { TOPIC_ATTACHMENT_MAX_BYTES } from "@carlnotes/contracts/attachmentTypes"
import { TextReader, Uint8ArrayWriter, ZipWriter } from "@zip.js/zip.js"
import { parsePersonalSourcesExport, previewPersonalSourcesTranscript } from "./personalSourcesExport"

// the supported ChatGPT mapping format includes one visible branch plus hidden tool and alternate-branch content
const chatGptExport = [
	{
		id: "conversation-a",
		title: "Coffee setup",
		create_time: 1_700_000_000,
		current_node: "answer",
		mapping: {
			root: { parent: null, message: null },
			question: {
				parent: "root",
				message: {
					author: { role: "user" },
					content: {
						content_type: "multimodal_text",
						parts: ["Use https://example.com/coffee", { image_asset_pointer: "attachment-canary" }],
					},
				},
			},
			tool: {
				parent: "question",
				message: { author: { role: "tool" }, content: { content_type: "text", parts: ["tool-canary"] } },
			},
			answer: {
				parent: "tool",
				message: {
					author: { role: "assistant" },
					content: { content_type: "text", parts: ["Try a smaller grinder."] },
				},
			},
			alternate: {
				parent: "question",
				message: { author: { role: "assistant" }, content: { content_type: "text", parts: ["alternate-canary"] } },
			},
		},
	},
]
const claudeExport = [
	{
		uuid: "conversation-b",
		name: "Brewing",
		created_at: "2026-10-01T12:00:00Z",
		chat_messages: [
			{ sender: "human", text: "A brewing question", attachments: [{ filename: "private.pdf" }] },
			{
				sender: "assistant",
				content: [
					{ type: "text", text: "A brewing answer" },
					{ type: "tool_use", text: "hidden-tool-canary" },
				],
			},
		],
	},
]

test("ChatGPT previews only the visible selected branch's text and safe links", async () => {
	const preview = await parsePersonalSourcesExport(encode(chatGptExport))
	expect(preview.provider).toBe("chatgpt")
	expect(preview.conversations[0]).toMatchObject({
		conversationId: "conversation-a",
		title: "Coffee setup",
		links: ["https://example.com/coffee"],
	})
	expect(preview.conversations[0]?.text).toBe(
		"Human: Use https://example.com/coffee\n\nAssistant: Try a smaller grinder.",
	)
	expect(JSON.stringify(preview)).not.toContain("canary")
})

test("Claude text excludes attachments and structured tool payloads", async () => {
	const preview = await parsePersonalSourcesExport(encode(claudeExport))
	expect(preview.provider).toBe("claude")
	expect(preview.conversations[0]?.text).toBe("Human: A brewing question\n\nAssistant: A brewing answer")
	expect(JSON.stringify(preview)).not.toContain("canary")
	expect(preview.conversations[0]?.createdAt).toBe("2026-10-01T12:00:00.000Z")
})

test("unsupported formats, broken branches, and oversized input fail without a partial preview", async () => {
	await expect(parsePersonalSourcesExport(encode({ conversations: claudeExport }))).rejects.toThrow()
	await expect(parsePersonalSourcesExport(encode([{ ...chatGptExport[0], current_node: "missing" }]))).rejects.toThrow()
	await expect(parsePersonalSourcesExport(new Uint8Array(TOPIC_ATTACHMENT_MAX_BYTES + 1))).rejects.toThrow("10 MiB")
})

test("ZIP imports extract the conversation file while ignoring attachment bytes", async () => {
	const archive = await zipFiles([
		{ name: "conversations.json", text: JSON.stringify(claudeExport) },
		{ name: "attachments/private.pdf", text: "attachment-canary" },
	])
	expect(await parsePersonalSourcesExport(archive)).toEqual(await parsePersonalSourcesExport(encode(claudeExport)))
})

test("ZIP traversal, duplicate conversation files, encryption, and excessive expansion fail", async () => {
	for (const unsafePath of ["../conversations.json", "/conversations.json", "folder\\conversations.json"]) {
		await expect(parsePersonalSourcesExport(await zipFiles([{ name: unsafePath, text: "[]" }]))).rejects.toThrow()
	}
	await expect(
		parsePersonalSourcesExport(
			await zipFiles([
				{ name: "conversations.json", text: "[]" },
				{ name: "nested/conversations.json", text: "[]" },
			]),
		),
	).rejects.toThrow()
	await expect(
		parsePersonalSourcesExport(await zipFiles([{ name: "conversations.json", text: "[]" }], "fixture-password")),
	).rejects.toThrow()
	await expect(
		parsePersonalSourcesExport(
			await zipFiles([{ name: "conversations.json", text: "x".repeat(TOPIC_ATTACHMENT_MAX_BYTES + 1) }]),
		),
	).rejects.toThrow()
})

test("paste previews preserve text but separate private references and cap safe candidates", () => {
	const links = Array.from({ length: 103 }, (_, index) => `https://example.com/article-${index}`)
	const text = [
		...links,
		"https://chatgpt.com/c/private-reference",
		"http://127.0.0.1/internal",
		"https://example.com/unsubscribe/secret",
	].join("\n")
	const preview = previewPersonalSourcesTranscript({ title: "Saved transcript", text })
	expect(preview.conversations[0]).toMatchObject({
		links: links.slice(0, 100),
		omittedLinkCount: 3,
		chatUrl: "https://chatgpt.com/c/private-reference",
		text,
	})
})

// UTF-8 bytes model the transferred browser File buffer
function encode(content: unknown): Uint8Array {
	return new TextEncoder().encode(JSON.stringify(content))
}

// generated archives exercise the real ZIP reader without retaining fixture binaries
async function zipFiles(files: { name: string; text: string }[], password?: string): Promise<Uint8Array> {
	const writer = new ZipWriter(new Uint8ArrayWriter(), { useWebWorkers: false, password })
	for (const file of files) {
		await writer.add(file.name, new TextReader(file.text))
	}
	return writer.close()
}
