// every color a rendered email writes is a Latte value, including the defaults react-email adds to a link or a divider
import { expect, test } from "bun:test"
import { emailColors } from "@carlnotes/nightshift/email"
import AuthEmail, { renderAuthEmail } from "./auth-email"
import ManualScanEmail, { renderManualScanEmail } from "./manual-scan-email"
import TeamInviteEmail, { renderTeamInviteEmail } from "./team-invite-email"
import TopicInviteEmail, { renderTopicInviteEmail } from "./topic-invite-email"
import TopicScanEmail, { renderTopicScanEmail } from "./topic-scan-email"

// a six-digit hex color in the html
const HEX_COLOR_PATTERN = /#[0-9a-f]{6}\b/gi

// the Latte values, lowercased to compare
const LATTE_HEX_COLORS = new Set(Object.values(emailColors).map((colorValue) => colorValue.toLowerCase()))

// each template rendered from its preview props
const TEMPLATE_RENDERS: [string, () => Promise<string>][] = [
	["auth-email", () => renderAuthEmail(AuthEmail.PreviewProps)],
	["team-invite-email", () => renderTeamInviteEmail(TeamInviteEmail.PreviewProps)],
	["topic-invite-email", () => renderTopicInviteEmail(TopicInviteEmail.PreviewProps)],
	["topic-scan-email", () => renderTopicScanEmail(TopicScanEmail.PreviewProps)],
	["manual-scan-email", () => renderManualScanEmail(ManualScanEmail.PreviewProps)],
	[
		"manual-scan-email failed",
		() =>
			renderManualScanEmail({
				...ManualScanEmail.PreviewProps,
				status: "failed",
				failureReason: "Every source timed out.",
			}),
	],
]

// one test per template, so a failure names the template and its colors outside the palette
for (const [templateName, render] of TEMPLATE_RENDERS) {
	test(`${templateName} renders only Latte colors`, async () => {
		const html = await render()
		const hexColors = [...new Set((html.match(HEX_COLOR_PATTERN) ?? []).map((hexColor) => hexColor.toLowerCase()))]
		expect(hexColors.filter((hexColor) => !LATTE_HEX_COLORS.has(hexColor))).toEqual([])
	})
}
