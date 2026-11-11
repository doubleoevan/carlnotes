// the page frame pattern: the page shell with its display-font title, the row of buttons over an avatar header, and
// the narrow centered column of a session page
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { Plus, Users } from "lucide-react"
import { fn } from "storybook/test"
import { AccordionSection } from "@/components/common/AccordionSection"
import { UserProfileLink } from "@/components/common/UserProfileLink"
import { Accordion } from "@/components/primitives/accordion"
import { Button } from "@/components/primitives/button"
import { VerifyEmailNotice } from "@/components/session/VerifyEmailNotice"
import { EmptyListCard } from "@/components/table/TableCard"
import {
	HIGHLIGHTED_PAGE_BUTTON_CLASS,
	PAGE_BUTTON_ROW_CLASS,
	PAGE_CLASS,
	PAGE_HEADER_CLASS,
	PAGE_TITLE_CLASS,
	PLAIN_PAGE_BUTTON_CLASS,
	PLAIN_PAGE_BUTTON_ICON_CLASS,
} from "@/lib/styleClasses"
import { STORY_USER, toStoryEmail, toStoryProfile } from "../../../.storybook/fixtures"
import { PHONE_VIEWPORT_GLOBALS } from "../../../.storybook/viewports"

/**
 * Renders a page in one of the app's frames: the page shell with its titled header, the page shell with its row of
 * buttons, or the session page's column.
 */
function PageFramePattern({
	frame,
	title,
	onAction,
}: {
	frame: "page" | "buttonRow" | "session"
	title: string
	// the page's action, the header button and the empty section's link
	onAction: () => void
}) {
	// the narrow centered column, as the signup page shows it after a password signup
	if (frame === "session") {
		return <VerifyEmailNotice email={toStoryEmail(STORY_USER.username)} redirectPath="#" />
	}

	// the Café's shell: the plain button at the left of the row of buttons and the highlighted one at its right, at one
	// size, with the same gap over the row as under it
	if (frame === "buttonRow") {
		return (
			<main className={PAGE_CLASS}>
				<div className={PAGE_BUTTON_ROW_CLASS}>
					<button type="button" className={PLAIN_PAGE_BUTTON_CLASS} onClick={onAction}>
						<Plus className={PLAIN_PAGE_BUTTON_ICON_CLASS} />
						New team
					</button>
					<button type="button" className={HIGHLIGHTED_PAGE_BUTTON_CLASS} onClick={onAction}>
						<Plus className="size-4" />
						New Topic
					</button>
				</div>
				<h1 className="font-display text-2xl">{title}</h1>
			</main>
		)
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
				<Button className={HIGHLIGHTED_PAGE_BUTTON_CLASS} onClick={onAction}>
					<Plus className="size-4" />
					New team
				</Button>
			</div>
			{/* whose page this is, with a link to their profile */}
			<UserProfileLink user={toStoryProfile(STORY_USER)} className="mt-2 text-sm" />
			{/* the page's first section under its header */}
			<div className="mt-2">
				<Accordion type="multiple" defaultValue={["teams"]}>
					<AccordionSection value="teams" title="Your teams">
						<EmptyListCard>
							<button type="button" onClick={onAction} className="sentence-link">
								Start a team.
							</button>{" "}
							Carl brews for everyone at once.
						</EmptyListCard>
					</AccordionSection>
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
		frame: { control: "inline-radio", options: ["page", "buttonRow", "session"] },
		title: { control: "text" },
		onAction: { control: false },
	},
	parameters: { layout: "fullscreen" },
} satisfies Meta<typeof PageFramePattern>

export default meta
type Story = StoryObj<typeof meta>

// PAGE_CLASS: the teams page's shell with its display-font title, icon, and action over its first section
export const Page: Story = {}

// PAGE_BUTTON_ROW_CLASS: the Café's row of buttons under the search bar, the plain button and the highlighted one at
// one size
export const PageButtonRow: Story = { args: { frame: "buttonRow", title: "River's Café" } }

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
