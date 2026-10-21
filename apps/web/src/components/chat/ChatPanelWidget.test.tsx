// the chat panel widget renders nothing on the server
import { expect, test } from "bun:test"
import { renderToString } from "react-dom/server"
import { ChatLoadingPanel, ChatPill } from "./ChatPanelWidget"

// the server HTML of the loading panel and the collapsed pill is empty, so hydration matches the first browser render
test("the loading panel and the pill render nothing on the server", () => {
	expect(renderToString(<ChatLoadingPanel isEnlarged={false} onPanelState={() => {}} />)).toBe("")
	expect(renderToString(<ChatPill onOpenChat={() => {}} />)).toBe("")
})
