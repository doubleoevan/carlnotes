// the page frame pattern: the page shell with its display-font title, and the narrow centered column of a session page
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { Plus, Users } from "lucide-react"
import { fn } from "storybook/test"
import { UserProfileLink } from "@/components/common/UserProfileLink"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/primitives/accordion"
import { Button } from "@/components/primitives/button"
import { VerifyEmailNotice } from "@/components/session/VerifyEmailNotice"
import { PAGE_CLASS, PAGE_HEADER_CLASS, PAGE_TITLE_CLASS } from "@/lib/styleClasses"
import { STORY_USER, toStoryEmail, toStoryProfile } from "../../../.storybook/fixtures"
import { PHONE_VIEWPORT_GLOBALS } from "../../../.storybook/viewports"

/**
 * Renders a page in one of the app's two frames: the page shell with its header, or the session page's column.
 */
function PageFramePattern({
	frame,
	title,
	onAction,
}: {
	frame: "page" | "session"
	title: string
	// the page's action, the header button and the empty section's link
	onAction: () => void
}) {
	// the narrow centered column, as the signup page shows it after a password signup
	if (frame === "session") {
		return <VerifyEmailNotice email={toStoryEmail(STORY_USER.username)} redirectPath="#" />
	}

	// the teams page's shell: the title with its icon and the page's action at the right, the user's profile link, and
	// the Your teams section of a user with no team yet
	return (
		<main className={PAGE_CLASS}>
			<div className={PAGE_HEADER_CLASS}>
				<h1 className={PAGE_TITLE_CLASS}>
					<Users className="size-6" />
					{title}
				</h1>
				<Button className="shrink-0" onClick={onAction}>
					<Plus className="size-4" />
					New team
				</Button>
			</div>
			{/* whose page this is, with a link to their profile */}
			<UserProfileLink user={toStoryProfile(STORY_USER)} className="mt-2 text-sm" />
			{/* the page's first section under its header */}
			<div className="mt-2">
				<Accordion type="multiple" defaultValue={["teams"]}>
					<AccordionItem value="teams">
						<AccordionTrigger className="font-semibold">Your teams</AccordionTrigger>
						<AccordionContent>
							<p className="text-muted-foreground pb-4 pl-4 text-sm">
								<button type="button" onClick={onAction} className="sentence-link">
									Start a team.
								</button>{" "}
								Carl brews for everyone at once.
							</p>
						</AccordionContent>
					</AccordionItem>
				</Accordion>
			</div>
		</main>
	)
}

const meta = {
	title: "Patterns/PageFrame",
	component: PageFramePattern,
	args: { frame: "page", title: "Teams", onAction: fn() },
	argTypes: {
		frame: { control: "inline-radio", options: ["page", "session"] },
		title: { control: "text" },
		onAction: { control: false },
	},
	parameters: { layout: "fullscreen" },
} satisfies Meta<typeof PageFramePattern>

export default meta
type Story = StoryObj<typeof meta>

// PAGE_CLASS: the teams page's shell with its display-font title, icon, and action over its first section
export const Page: Story = {}

// SESSION_PAGE_CLASS: the narrow centered column of the sign-in, signup, and invite pages
export const SessionPage: Story = {
	args: { frame: "session" },
	// the session page writes its own title and action, so those controls do nothing here
	argTypes: { title: { table: { disable: true } }, onAction: { table: { disable: true } } },
}

// the page shell on a 375-pixel-wide phone, with its side padding
export const PagePhone: Story = {
	// the docs page is wider than a phone, so the story stays off it
	tags: ["!autodocs"],
	globals: PHONE_VIEWPORT_GLOBALS,
}
