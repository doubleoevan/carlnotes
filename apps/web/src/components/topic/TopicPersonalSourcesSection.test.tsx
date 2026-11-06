import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test"
import * as auth from "@carlnotes/client/authClient"
import * as client from "@carlnotes/client/personalSourcesClient"
import { PersonalSourceLink, type PersonalSourceLinkElements } from "@carlnotes/core/components/PersonalSourceLink"
import { TopicPersonalSourcesSection } from "@carlnotes/core/components/TopicPersonalSourcesSection"
import { PERSONAL_SOURCES_CONVERSATION_EXAMPLES } from "@carlnotes/core/lib/personalSourcesConversationStories"
import { toPersonalSourceSenderIdentity } from "@carlnotes/core/lib/personalSourcesCopy"
import {
	PERSONAL_SOURCES_ENTRIES_STORY,
	PERSONAL_SOURCES_TOPIC_STORY,
	TOPIC_PERSONAL_SOURCES_STORY,
} from "@carlnotes/core/lib/personalSourcesStories"
import { act, type ReactNode } from "react"
import { renderTestHook, waitForHook } from "@/lib/hookTestHarness"
import { PERSONAL_SOURCES_ELEMENTS } from "./personalSourcesElements"

// keep platform navigation outside the harness while exercising real disclosure buttons
const LINK_ELEMENTS: PersonalSourceLinkElements = {
	Row: ({ children }) => <div>{children}</div>,
	SourceLink: ({ url, label }) => (
		<a href={url} target="_blank" rel="noopener noreferrer">
			{label}
		</a>
	),
	Pending: ({ children }) => <span>{children}</span>,
	FindingFrame: ({ label, onOpenChange, children }) => (
		<>
			<button type="button" onClick={() => onOpenChange(true)}>
				{label}
			</button>
			{children}
		</>
	),
	FindingDetails: ({ resource, onClose }) => (
		<div role="dialog" aria-label="Topic finding">
			<p>{resource.relevanceExplanation}</p>
			<button type="button" onClick={onClose}>
				Close finding
			</button>
		</div>
	),
}
const ELEMENTS = {
	...PERSONAL_SOURCES_ELEMENTS,
	PersonalSourceLink: (props: React.ComponentProps<typeof PERSONAL_SOURCES_ELEMENTS.PersonalSourceLink>) => (
		<PersonalSourceLink {...props} elements={LINK_ELEMENTS} />
	),
	Link: ({ href, children, onPress }: { href: string; children: ReactNode; onPress?: () => void }) => (
		<a href={href} onClick={onPress}>
			{children}
		</a>
	),
}
const topic = { ...PERSONAL_SOURCES_TOPIC_STORY, canEdit: true, canReadPersonalSources: true }
const fixture = PERSONAL_SOURCES_ENTRIES_STORY[0]
if (!fixture) {
	throw new Error("Missing Personal sources fixture")
}
const entry = {
	...fixture,
	title: "Private item title",
	text: "Exact saved text",
	expiresAt: null,
}
const cleanups: (() => Promise<void>)[] = []
beforeEach(() => {
	spyOn(auth, "authClient").mockReturnValue({
		useSession: () => ({ data: { user: { id: "sender" } }, isPending: false }),
	} as ReturnType<typeof auth.authClient>)
	spyOn(client, "fetchTopicPersonalSources").mockResolvedValue(TOPIC_PERSONAL_SOURCES_STORY)
	spyOn(client, "fetchTopicPersonalSourcesEntries").mockResolvedValue({ entries: [entry], nextCursor: null })
})
afterEach(async () => {
	for (const close of cleanups.splice(0)) {
		await close()
	}
	mock.restore()
})

test("Personal sources opens the whole section and individual items expand independently", async () => {
	const harness = await renderTestHook(
		() => null,
		() => <TopicPersonalSourcesSection topic={topic} elements={ELEMENTS} onCopy={async () => true} />,
	)
	cleanups.push(harness.close)
	await waitForHook(() => Boolean(harness.container.querySelector("button[aria-expanded]")))
	expect(client.fetchTopicPersonalSourcesEntries).not.toHaveBeenCalled()
	expect(harness.container.textContent).not.toContain(entry.title)
	expect(harness.container.querySelectorAll("button[aria-expanded]")).toHaveLength(1)
	const section = harness.container.querySelector<HTMLButtonElement>("button[aria-expanded]")
	if (!section) {
		throw new Error("Missing Personal sources disclosure")
	}
	expect(section.textContent).toContain("Only you can see this")
	expect(section.textContent).toContain("Personal sources · 23 items")
	await act(async () => section.click())
	await waitForHook(() => Boolean(harness.container.textContent?.includes(entry.title)))
	expect(harness.client.getQueryCache().findAll({ queryKey: ["topic-personal-sources-context"] })).toHaveLength(0)
	expect(harness.container.textContent).not.toContain("Not counted toward the 10")
	expect(harness.container.textContent).not.toContain(entry.text)
	expect(harness.container.querySelectorAll("button[aria-expanded]")).toHaveLength(2)
	const row = [...harness.container.querySelectorAll<HTMLButtonElement>("button[aria-expanded]")].find((button) =>
		button.textContent?.includes(entry.title),
	)
	if (!row) {
		throw new Error("Missing item disclosure")
	}
	expect(row.textContent?.startsWith("1Private item title")).toBe(true)
	await act(async () => row.click())
	expect(row.getAttribute("aria-expanded")).toBe("true")
	expect(harness.container.textContent).toContain(entry.text)
	expect(harness.container.textContent).not.toContain("Became a finding")
	expect(harness.container.textContent).not.toContain("Scored, not kept")
	expect(harness.container.textContent).toContain("Next brew")
	expect(harness.container.querySelector('a[href^="/topics/"]')).toBeNull()
	expect(row.querySelector("a,button")).toBeNull()
	const findingLink = [...harness.container.querySelectorAll<HTMLButtonElement>("button")].find(
		(button) => button.textContent === topic.findings[0]?.title,
	)
	await act(async () => findingLink?.click())
	expect(harness.container.querySelector('[role="dialog"]')?.textContent).toContain(
		topic.findings[0]?.relevanceExplanation ?? "missing",
	)
	const closeFinding = [...harness.container.querySelectorAll<HTMLButtonElement>("button")].find(
		(button) => button.textContent === "Close finding",
	)
	await act(async () => closeFinding?.click())
	expect(harness.container.querySelector('[role="dialog"]')).toBeNull()
	expect(row.getAttribute("aria-expanded")).toBe("true")
	expect(section.getAttribute("aria-expanded")).toBe("true")
	expect(harness.container.querySelector('a[href="https://hamel.dev/"]')?.getAttribute("target")).toBe("_blank")
	expect(harness.container.querySelector('a[href="https://hamel.dev/"]')?.textContent).toBe(
		"A practical guide to evaluating language models",
	)
	expect(harness.container.querySelector('a[href="https://github.com/"]')?.textContent).toBe("https://github.com/")
	await act(async () => row.click())
	expect(harness.container.textContent).not.toContain(entry.text)
	expect(harness.client.getQueryCache().findAll({ queryKey: ["topic-personal-sources-context"] })).toHaveLength(0)
	await act(async () => section.click())
	expect(harness.container.textContent).not.toContain(entry.title)
	expect(harness.container.textContent).not.toContain("Exact private scoring summary")
	expect(harness.container.textContent).not.toContain("Not counted toward the 10")
})

test("a viewer without their own history makes no private reads", async () => {
	const harness = await renderTestHook(
		() => null,
		() => (
			<TopicPersonalSourcesSection
				topic={{ ...topic, canEdit: false, canReadPersonalSources: false }}
				elements={ELEMENTS}
				onCopy={async () => true}
			/>
		),
	)
	cleanups.push(harness.close)
	expect(harness.container.textContent).toBe("")
	expect(client.fetchTopicPersonalSources).not.toHaveBeenCalled()
	expect(client.fetchTopicPersonalSourcesEntries).not.toHaveBeenCalled()
})

test("empty history leaves no section or divider and retiring the final item releases private content", async () => {
	const emptyMetadata = {
		...TOPIC_PERSONAL_SOURCES_STORY,
		sources: TOPIC_PERSONAL_SOURCES_STORY.sources.map((source) => ({ ...source, entryCount: 0 })),
	}
	spyOn(client, "fetchTopicPersonalSources").mockResolvedValue(emptyMetadata)
	const harness = await renderTestHook(
		() => null,
		() => (
			<TopicPersonalSourcesSection
				topic={topic}
				elements={ELEMENTS}
				onCopy={async () => true}
				className="border-t border-dashed border-separator-strong"
			/>
		),
	)
	cleanups.push(harness.close)
	const metadataKey = ["topic-personalSources", "sender", topic.id]
	await waitForHook(() => harness.client.getQueryData(metadataKey) !== undefined)
	expect(harness.container.innerHTML).toBe("")
	expect(client.fetchTopicPersonalSourcesEntries).not.toHaveBeenCalled()
	await act(async () => harness.client.setQueryData(metadataKey, TOPIC_PERSONAL_SOURCES_STORY))
	await waitForHook(() => Boolean(harness.container.querySelector("button[aria-expanded]")))
	spyOn(client, "fetchTopicPersonalSources").mockResolvedValue(TOPIC_PERSONAL_SOURCES_STORY)
	await act(async () => harness.container.querySelector<HTMLButtonElement>("button[aria-expanded]")?.click())
	await waitForHook(() => Boolean(harness.container.textContent?.includes(entry.title)))
	await act(async () => harness.client.setQueryData(metadataKey, emptyMetadata))
	await waitForHook(() => harness.container.innerHTML === "")
	expect(harness.container.innerHTML).toBe("")
	await waitForHook(
		() => harness.client.getQueryCache().findAll({ queryKey: ["topic-personalSources-entries"] }).length === 0,
	)
	await waitForHook(
		() => harness.client.getQueryCache().findAll({ queryKey: ["topic-personal-sources-context"] }).length === 0,
	)
})

test("a former editor can read retained items without new-send setup", async () => {
	const harness = await renderTestHook(
		() => null,
		() => (
			<TopicPersonalSourcesSection topic={{ ...topic, canEdit: false }} elements={ELEMENTS} onCopy={async () => true} />
		),
	)
	cleanups.push(harness.close)
	await waitForHook(() => Boolean(harness.container.querySelector("button[aria-expanded]")))
	await act(async () => harness.container.querySelector<HTMLButtonElement>("button[aria-expanded]")?.click())
	await waitForHook(() => Boolean(harness.container.textContent?.includes(entry.title)))
	expect(harness.container.textContent).toContain("Sending requires Topic edit access")
	expect(harness.container.textContent).not.toContain("From Claude or ChatGPT")
})

test("collapsing Personal sources aborts private reads and clears its private page", async () => {
	let signal: AbortSignal | undefined
	spyOn(client, "fetchTopicPersonalSourcesEntries").mockImplementation((request) => {
		signal = request.signal
		return new Promise(() => {})
	})
	const harness = await renderTestHook(
		() => null,
		() => <TopicPersonalSourcesSection topic={topic} elements={ELEMENTS} onCopy={async () => true} />,
	)
	cleanups.push(harness.close)
	await waitForHook(() => Boolean(harness.container.querySelector("button[aria-expanded]")))
	const section = harness.container.querySelector<HTMLButtonElement>("button[aria-expanded]")
	await act(async () => section?.click())
	await waitForHook(() => Boolean(signal))
	expect(harness.container.textContent).toContain("Steeping")
	await act(async () => section?.click())
	expect(section?.getAttribute("aria-expanded")).toBe("false")
	expect(signal?.aborted).toBe(true)
	await waitForHook(
		() => harness.client.getQueryCache().findAll({ queryKey: ["topic-personalSources-entries"] }).length === 0,
	)
})

// the content and identity fields come from core, with only icon drawing adapted to the platform
test("expanded metadata shows dates with AI marks or a mail icon and address, without transport suffixes", async () => {
	const entries = [
		{
			...entry,
			id: "chatgpt",
			title: "AI metadata fixture",
			chatUrl: null,
			origin: "send" as const,
			sender: "ChatGPT",
			receivedAt: "2026-11-04T21:16:00Z",
		},
		{
			...entry,
			id: "email",
			title: "Email metadata fixture",
			origin: "email" as const,
			sender: "doubleoevan@gmail.com",
			receivedAt: "2026-11-04T21:16:00Z",
		},
	]
	spyOn(client, "fetchTopicPersonalSourcesEntries").mockResolvedValue({ entries, nextCursor: null })
	const harness = await renderTestHook(
		() => null,
		() => <TopicPersonalSourcesSection topic={topic} elements={ELEMENTS} onCopy={async () => true} />,
	)
	cleanups.push(harness.close)
	await waitForHook(() => Boolean(harness.container.querySelector("button[aria-expanded]")))
	await act(async () => harness.container.querySelector<HTMLButtonElement>("button[aria-expanded]")?.click())
	await waitForHook(() => Boolean(harness.container.textContent?.includes("AI metadata fixture")))
	const [, chatGptRow, emailRow] = harness.container.querySelectorAll<HTMLButtonElement>("button[aria-expanded]")

	// the AI send shows its mark, its date, and its sender with no time or transport suffix
	await act(async () => chatGptRow?.click())
	expect(harness.container.textContent).toContain("2026-11-04 ·ChatGPT")
	expect(harness.container.querySelector('svg[role="presentation"]')).not.toBeNull()
	expect(harness.container.textContent).not.toContain("21:16")
	expect(harness.container.textContent).not.toContain("UTC")
	expect(harness.container.textContent).not.toContain("· send")

	// the email shows its mail icon and address, and opening it closes the AI send
	await act(async () => emailRow?.click())
	expect(harness.container.textContent).toContain("2026-11-04 ·doubleoevan@gmail.com")
	expect(harness.container.querySelectorAll(".lucide-mail")).toHaveLength(1)
	expect(harness.container.textContent).not.toContain("· email")
	expect(harness.container.textContent).not.toContain("2026-11-04 ·ChatGPT")
	expect(chatGptRow?.getAttribute("aria-expanded")).toBe("false")
	expect(emailRow?.getAttribute("aria-expanded")).toBe("true")

	// a second press closes the open Personal Source Entry, and the Personal sources section stays open
	await act(async () => emailRow?.click())
	expect(harness.container.textContent).not.toContain("2026-11-04 ·doubleoevan@gmail.com")
	expect(harness.container.textContent).toContain("Email metadata fixture")
})

test("the shared sender label is the private conversation link, with a launch icon and no duplicate body link", async () => {
	const chatUrl = "https://chatgpt.com/c/private-reference"
	spyOn(client, "fetchTopicPersonalSourcesEntries").mockResolvedValue({
		entries: [
			{
				...entry,
				chatUrl,
				sender: "ChatGPT",
				origin: "send",
				receivedAt: "2020-01-01T00:00:00Z",
				expiresAt: "2020-01-31T00:00:00Z",
			},
		],
		nextCursor: null,
	})
	const harness = await renderTestHook(
		() => null,
		() => <TopicPersonalSourcesSection topic={topic} elements={ELEMENTS} onCopy={async () => true} />,
	)
	cleanups.push(harness.close)
	await waitForHook(() => Boolean(harness.container.querySelector("button[aria-expanded]")))
	await act(async () => harness.container.querySelector<HTMLButtonElement>("button[aria-expanded]")?.click())
	await waitForHook(() => Boolean(harness.container.textContent?.includes(entry.title)))
	const row = [...harness.container.querySelectorAll<HTMLButtonElement>("button[aria-expanded]")].find((button) =>
		button.textContent?.includes(entry.title),
	)
	await act(async () => row?.click())
	const links = harness.container.querySelectorAll<HTMLAnchorElement>(`a[href="${chatUrl}"]`)
	expect(links).toHaveLength(1)
	expect(links[0]?.textContent).toBe("2020-01-01 ·ChatGPT")
	expect(links[0]?.className).toContain("text-link")
	expect(links[0]?.querySelector(".lucide-external-link")).not.toBeNull()
	expect(links[0]?.target).toBe("_blank")
	expect(harness.container.textContent).not.toContain("Kept until you delete it")
	expect(harness.container.textContent).toContain(entry.text)
	expect(harness.container.textContent).not.toContain("Expires")
})

// every provider uses one complete metadata link or a plain row when no reference exists
test.each(Object.entries(PERSONAL_SOURCES_CONVERSATION_EXAMPLES))(
	"%s metadata uses the shared link layout",
	async (_name, example) => {
		const identity = toPersonalSourceSenderIdentity({ sender: example.label, origin: "send", chatUrl: example.href })
		const harness = await renderTestHook(
			() => null,
			() => (
				<PERSONAL_SOURCES_ELEMENTS.Sender
					date="2026-11-04"
					kind="send"
					chatUrl={example.href ?? undefined}
					{...identity}
				/>
			),
		)
		cleanups.push(harness.close)
		const anchor = harness.container.querySelector("a")
		if (!example.href) {
			expect(anchor).toBeNull()
			return
		}
		expect(anchor?.getAttribute("href")).toBe(example.href)
		expect(anchor?.textContent).toBe(`2026-11-04 ·${identity.label}`)
		expect(anchor?.className).toContain("text-link")
		expect(anchor?.querySelector(".lucide-external-link")).not.toBeNull()
		expect(anchor?.querySelector("svg")).not.toBeNull()
		expect(anchor?.getAttribute("target")).toBe(example.href.startsWith("codex:") ? null : "_blank")
	},
)
