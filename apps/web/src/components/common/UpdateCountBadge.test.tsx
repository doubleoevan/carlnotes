// topic invitation badge tests: the label counts, and each bullet bolds who invited the user and to what
import { expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { toTopicInviteLabel, toTopicInviteLines } from "./UpdateCountBadge"

// one invitation reads singular, more read plural
test("the topic invitation label counts invitations", () => {
	expect(toTopicInviteLabel(1)).toBe("1 topic invitation")
	expect(toTopicInviteLabel(3)).toBe("3 topic invitations")
})

// a bullet names the inviter and the topic, both bold, keyed by the invitation
test("a tooltip bullet bolds the inviter and the topic", () => {
	const [tooltipLine] = toTopicInviteLines([
		{
			inviteId: "invite-1",
			topicId: "topic-1",
			topicName: "Screenwriting contests worth entering",
			inviterUsername: "Silky-Brew",
		},
	])
	expect(tooltipLine?.key).toBe("invite-1")
	expect(renderToStaticMarkup(tooltipLine?.line)).toBe(
		'<span class="font-semibold">Silky-Brew</span> invited you to subscribe to <span class="font-semibold">Screenwriting contests worth entering</span>',
	)
})
