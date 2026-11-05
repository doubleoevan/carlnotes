// render current templates with Bun and serve their HTML in React Email
import { mkdir, readdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { SITE_URL } from "@carlnotes/contracts/site"
import { render } from "@react-email/render"
import { createElement, type ReactElement } from "react"
import AuthEmail from "./auth-email"
import ManualScanEmail from "./manual-scan-email"
import PersonalSourcesEmail, { type PersonalSourcesEmailProps } from "./personal-sources-email"
import ReportEmail from "./report-email"
import TeamInviteEmail from "./team-invite-email"
import TopicInviteEmail from "./topic-invite-email"
import TopicScanEmail from "./topic-scan-email"

// every template receives its own synthetic preview props
const previewRoot = join(tmpdir(), `carlnotes-email-previews-${Bun.hash(process.cwd()).toString(16)}`)
await mkdir(previewRoot, { recursive: true })
const previews: [string, ReactElement][] = [
	["auth-email", createElement(AuthEmail, AuthEmail.PreviewProps)],
	["manual-scan-email", createElement(ManualScanEmail, ManualScanEmail.PreviewProps)],
	["report-email", createElement(ReportEmail, ReportEmail.PreviewProps)],
	["team-invite-email", createElement(TeamInviteEmail, TeamInviteEmail.PreviewProps)],
	["topic-invite-email", createElement(TopicInviteEmail, TopicInviteEmail.PreviewProps)],
	["topic-scan-email", createElement(TopicScanEmail, TopicScanEmail.PreviewProps)],
	...toPersonalSourcesEmailPreviews(),
]
// remove retired previews from this script's temporary directory
await removeStalePreviews(previews.map(([name]) => `${name}.html`))
for (const [name, element] of previews) {
	await writeFile(join(previewRoot, `${name}.html`), await render(element))
}

// the preview browser serves HTML without compiling another template runtime
const preview = Bun.spawn(
	[
		"node",
		"--experimental-vm-modules",
		"--disable-warning=ExperimentalWarning",
		"node_modules/.bin/email",
		"dev",
		"--dir",
		previewRoot,
		"--port",
		"3011",
		...Bun.argv.slice(2),
	],
	{ stdout: "inherit", stderr: "inherit", stdin: "inherit" },
)
process.on("exit", () => preview.kill())
process.on("SIGTERM", () => {
	preview.kill()
	process.exit(0)
})
process.on("SIGINT", () => {
	preview.kill()
	process.exit(0)
})
process.exitCode = await preview.exited

// every email outcome renders the production component with synthetic data
function toPersonalSourcesEmailPreviews(): [string, ReactElement][] {
	const choices = [
		{ number: 1, id: "evals", name: "LLM evals", url: `${SITE_URL}/topics/evals` },
		{ number: 2, id: "agents", name: "Agent infrastructure", url: `${SITE_URL}/topics/agents` },
	]
	const replies: [string, PersonalSourcesEmailProps["reply"]][] = [
		[
			"personal-sources-confirmation-email",
			{ kind: "filed", topics: choices.map((topic) => ({ name: topic.name, url: topic.url, entryId: topic.id })) },
		],
		[
			"personal-sources-clarification-email",
			{
				kind: "needs_topic",
				requestId: "9101167a-feda-432b-ae30-ab25e98ff350",
				topics: choices.map(({ id, name, url }) => ({ id, name, url })),
			},
		],
		["personal-sources-quota-email", { kind: "not_filed", reason: "quota" }],
		["personal-sources-plan-email", { kind: "not_filed", reason: "plan" }],
		["personal-sources-account-email", { kind: "not_filed", reason: "account" }],
	]
	return replies.map(([name, reply]) => [
		name,
		createElement(PersonalSourcesEmail, { reply, receivingAddress: "carl@example.com", appUrl: SITE_URL }),
	])
}

// keep only current templates in the temporary preview catalog
async function removeStalePreviews(currentNames: string[]): Promise<void> {
	const names = await readdir(previewRoot)
	for (const name of names) {
		if (name.endsWith(".html") && !currentNames.includes(name)) {
			await rm(join(previewRoot, name))
		}
	}
}
