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
	const redactedEvent = redactMobileEvent(event)

	// the private values are gone, and the stack, the device model, and the route shape stay
	expect(JSON.stringify(redactedEvent)).not.toContain("secret")
	expect(JSON.stringify(redactedEvent)).not.toContain("private")
	expect(redactedEvent.exception).toEqual(event.exception)
	expect<unknown>(redactedEvent.contexts?.device).toEqual({ model: "iPhone 18 Pro" })
	expect(redactedEvent.transaction).toBe("/topics/:id/notes/:noteId")
	expect<unknown>(redactedEvent.extra?.nested).toEqual({ count: 2 })
	expect<unknown>(redactedEvent.request).toEqual({ url: "https://carlnotes.com" })
})

test("native URLs are redacted in requests, navigation, breadcrumbs, and span descriptions", () => {
	for (const url of [
		"carlnotes://invite/private-secret?code=secret",
		"CARLNOTES://topics/private-secret/notes/note-secret",
		"exp+carlnotes://expo-development-client/?url=secret",
		"mailto:private-secret@example.com",
	]) {
		// custom schemes must not carry bearer tokens or private routes through any event field
		const redactedEvent = redactMobileEvent({
			request: { url },
			transaction: url,
			breadcrumbs: [{ category: "navigation", data: { url } }],
			spans: [{ description: `Open ${url}`, data: { target: url } }],
			extra: { target: `Open ${url}` },
		})
		expect(JSON.stringify(redactedEvent)).not.toContain("secret")
		expect(redactedEvent.transaction).toBe("[url]")
		expect(redactedEvent.spans?.[0]?.description).toBe("Open [url]")
	}
})

// chat transport failures keep platform diagnostics but no conversation or session material
test("chat failures redact tool content, session headers, and authenticated stream URLs", () => {
	const redactedEvent = redactMobileEvent({
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
	expect(JSON.stringify(redactedEvent)).not.toContain("private")
	expect(JSON.stringify(redactedEvent)).not.toContain("secret")
	expect(redactedEvent.contexts?.device).toEqual({ model: "iPhone", os: "iOS" })
	expect<unknown>(redactedEvent.request).toEqual({ url: "https://carlnotes.com" })
})

test("mobile errors redact a push token quoted in an exception", () => {
	// the token the push service quotes back in a failed registration
	const event = redactMobileEvent({
		exception: { values: [{ value: "registration failed for ExpoPushToken[native-private-token]" }] },
	})
	expect(JSON.stringify(event)).not.toContain("native-private-token")
})

test("voice failures redact the transcript and the cache file paths in fields and exceptions", () => {
	// a failed recording's report, with its transcript, its file uri, and its bare path on each platform
	const redactedEvent = redactMobileEvent({
		extra: {
			transcript: "private spoken question",
			fileUri: "file:///var/mobile/Containers/Data/Application/private-app/Library/Caches/spoken-part-1-2.mp3",
			path: "/data/user/0/com.carlnotes/cache/Audio/voice-recording-private.m4a",
		},
		contexts: { voice: { transcript: "private spoken question", platform: "ios" } },
		exception: {
			values: [{ type: "Error", value: "Unable to delete /private/var/mobile/private-app/voice-recording-1.m4a" }],
		},
	})

	// the words and the paths are gone, and the platform and the error's type stay
	expect(JSON.stringify(redactedEvent)).not.toContain("private")
	expect(JSON.stringify(redactedEvent)).not.toContain("voice-recording")
	expect(JSON.stringify(redactedEvent)).not.toContain("spoken-part")
	expect<unknown>(redactedEvent.contexts?.voice).toEqual({ platform: "ios" })
	expect(redactedEvent.exception?.values?.[0]?.value).toBe("Unable to delete [path]")
})
