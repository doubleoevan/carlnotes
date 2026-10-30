import { expect, test } from "bun:test"
import { redactMobileEvent } from "./monitoringRedaction"

// preserve useful diagnostics while removing native form state and request credentials
test("mobile errors retain stacks and device diagnostics without private data", () => {
	const event = {
		user: { email: "private@example.com" },
		transaction: "/topics/topic-secret/notes/note-secret",
		spans: [
			{
				description: "GET https://carlnotes.com/api/notes/note-secret?token=secret",
				data: { "url.path": "/api/notes/note-secret" },
			},
		],
		request: {
			url: "https://carlnotes.com/api/notes/note-secret?token=secret",
			headers: { cookie: "secret" },
			data: "private comment",
			query_string: "token=secret",
		},
		extra: { nested: { params: { noteId: "note-secret" }, prompt: "private prompt", count: 2 } },
		contexts: {
			device: { model: "iPhone 18 Pro", id: "install-secret" },
			route: { params: { noteId: "note-secret" }, path: "/topics/topic-secret/notes/note-secret" },
		},
		breadcrumbs: [
			{ category: "console", message: "private comment" },
			{
				category: "http",
				message: "private URL",
				data: {
					url: "https://carlnotes.com/api/notes/note-secret?token=secret",
					headers: { authorization: "secret" },
					status_code: 200,
				},
			},
		],
		exception: {
			values: [{ type: "Error", value: "Save failed", stacktrace: { frames: [{ filename: "index.js", lineno: 12 }] } }],
		},
	}
	const result = redactMobileEvent(event)

	// the private values are gone, and the stack, the device model, and the route shape stay
	expect(JSON.stringify(result)).not.toContain("secret")
	expect(JSON.stringify(result)).not.toContain("private")
	expect(result.exception).toEqual(event.exception)
	expect<unknown>(result.contexts?.device).toEqual({ model: "iPhone 18 Pro" })
	expect(result.transaction).toBe("/topics/:id/notes/:noteId")
	expect<unknown>(result.extra?.nested).toEqual({ count: 2 })
	expect<unknown>(result.request).toEqual({ url: "https://carlnotes.com" })
})

test("native URLs are redacted in requests, navigation, breadcrumbs, and span descriptions", () => {
	for (const url of [
		"carlnotes://invite/private-secret?code=secret",
		"CARLNOTES://topics/private-secret/notes/note-secret",
		"exp+carlnotes://expo-development-client/?url=secret",
		"mailto:private-secret@example.com",
	]) {
		// custom schemes must not carry bearer tokens or private routes through any event field
		const result = redactMobileEvent({
			request: { url },
			transaction: url,
			breadcrumbs: [{ category: "navigation", data: { url } }],
			spans: [{ description: `Open ${url}`, data: { target: url } }],
			extra: { target: `Open ${url}` },
		})
		expect(JSON.stringify(result)).not.toContain("secret")
		expect(result.transaction).toBe("[url]")
		expect(result.spans?.[0]?.description).toBe("Open [url]")
	}
})

// chat transport failures keep platform diagnostics but no conversation or session material
test("chat failures redact tool content, session headers, and authenticated stream URLs", () => {
	const result = redactMobileEvent({
		request: {
			url: "https://carlnotes.com/api/topics/private-secret/chat/events?after=99",
			headers: { Cookie: "secret" },
			data: "private message",
		},
		contexts: {
			device: { model: "iPhone", os: "iOS" },
			chat: {
				prompt: "private prompt",
				toolCalls: [{ input: "private proposal" }],
				attachments: [{ name: "private file" }],
				content: "private answer",
			},
		},
		breadcrumbs: [{ category: "console", message: "private response", data: { headers: { Authorization: "secret" } } }],
	})
	expect(JSON.stringify(result)).not.toContain("private")
	expect(JSON.stringify(result)).not.toContain("secret")
	expect(result.contexts?.device).toEqual({ model: "iPhone", os: "iOS" })
	expect<unknown>(result.request).toEqual({ url: "https://carlnotes.com" })
})

test("mobile errors redact a push token quoted in an exception", () => {
	// the token the push service quotes back in a failed registration
	const event = redactMobileEvent({
		exception: { values: [{ value: "registration failed for ExpoPushToken[native-private-token]" }] },
	})
	expect(JSON.stringify(event)).not.toContain("native-private-token")
})
