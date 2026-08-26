// render tests for the shared author line above the chat message
import { expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { MemoryRouter } from "react-router-dom"
import { ChatMessages } from "./ChatMessages"

// the author lines link to profiles through the router, so every render mounts inside one
const renderWithRouter = (node: React.ReactNode): string => renderToStaticMarkup(<MemoryRouter>{node}</MemoryRouter>)
// the user whose questions the private chat renders
const USER = { userId: "user-1", username: "ana", avatarSource: null }

// every message includes its author: the user on each question, carl on each answer
test("private chat turns each render their author line", () => {
	const chatTurns = [
		{ question: "why this brew", answer: "because it holds", at: 1_700_000_000_000, rejection: null },
		{ question: "and this one", answer: "same reason", at: 1_700_000_060_000, rejection: null },
	]
	const html = renderWithRouter(
		<ChatMessages chatTurns={chatTurns} isEnlarged={false} isStreaming={false} topicName="brew" author={USER} />,
	)

	// two questions, two answers, four author lines, never collapsed on consecutive turns
	expect(html.split(">ana<").length - 1).toBe(2)
	expect(html.split(">Carl<").length - 1).toBe(2)
	// carl's face is the racoon
	expect(html).toContain('alt="Carl"')
	// the user's author lines link to their profile, and carl's link nowhere
	expect(html.split('href="/profiles/user-1"').length - 1).toBe(2)
	expect(html).not.toContain('href="/profiles/"')
})
