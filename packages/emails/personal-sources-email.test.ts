// outgoing receipts are numbered, linked, and private-content-free in both email representations
import { expect, test } from "bun:test"
import { renderPersonalSourcesEmail, renderPersonalSourcesEmailText } from "./personalSourcesEmail"

const reply = {
	kind: "filed" as const,
	topics: [
		{ name: "LLM evals & testing", url: "https://carlnotes.com/topics/evals", entryId: "eval-entry" },
		{ name: "Agent infrastructure", url: "https://carlnotes.com/topics/agents", entryId: "agent-entry" },
	],
}

test("a filed email lists every linked Topic without extra removal guidance", async () => {
	const html = await renderPersonalSourcesEmail({ reply, receivingAddress: "carl@example.com" })
	const text = await renderPersonalSourcesEmailText({ reply, receivingAddress: "carl@example.com" })
	expect(html).toContain("Carl sent your message to these topics:")
	expect(html).toContain("<ol")
	expect(html).toContain('href="https://carlnotes.com/topics/evals"')
	expect(html).toContain('href="https://carlnotes.com/topics/agents"')
	expect(html).toContain("LLM evals &amp; testing")
	expect(text).toMatch(/1\.\s+LLM evals & testing/)
	expect(text).toMatch(/2\.\s+Agent infrastructure/)
	expect(text).not.toContain("If a topic is wrong")
	expect(text).not.toContain("eval-entry")
})

test("clarification asks for a new request without an approval step", async () => {
	const text = await renderPersonalSourcesEmailText({
		receivingAddress: "carl@example.com",
		reply: { kind: "needs_topic" },
	})
	expect(text).toContain("Which topic is this for?")
	expect(text).toContain("Email your message")
	expect(text).toContain("topic: Topic name")
	expect(text).not.toContain('Reply "yes"')
	expect(text).not.toContain("waiting")
	expect(text).not.toContain("capacity")
})

test("numbered clarification asks for a short reply without extra warnings", async () => {
	const text = await renderPersonalSourcesEmailText({
		receivingAddress: "carl@example.com",
		reply: {
			kind: "needs_topic",
			requestId: "9101167a-feda-432b-ae30-ab25e98ff350",
			topics: [{ id: "coffee", name: "Coffee", url: "https://carlnotes.com/topics/coffee" }],
		},
	})
	expect(text).toContain("Coffee")
	expect(text).toContain("Reply with numbers, topic names, or both")
	expect(text).not.toContain("cancel")
	expect(text).not.toContain("allowance")
	expect(text).not.toContain("encrypted")
})
