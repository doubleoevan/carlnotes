// every story's frame: the app's globals.css with the real tokens, the light and dark toggle, the accessibility check,
// a query client, the toast host, the user a story names, and mocked api clients, so no story reaches a server. every
// docs page takes the toolbar's theme on the app's page fill, and a story in its own frame there takes the page's theme
import { darkRoast, latte, type Palette } from "@carlnotes/nightshift/colors"
import { toRadiusPixels } from "@carlnotes/nightshift/radius"
import { DocsContainer, type DocsContainerProps } from "@storybook/addon-docs/blocks"
import { DecoratorHelpers } from "@storybook/addon-themes"
import type { Preview } from "@storybook/tanstack-react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { Fragment, type PropsWithChildren, type ReactNode, useSyncExternalStore } from "react"
import { sb } from "storybook/test"
import { create, type ThemeVars } from "storybook/theming"
import { Toaster } from "@/components/primitives/sonner"
import { toGuardedFetch } from "../src/nightshift/guardedFetch"
import { toMemoryStorage } from "../src/nightshift/memoryStorage"
import { STORY_SESSIONS, type StorySessionName } from "./fixtures"
import { StorySessionContext } from "./mocks/authClient"
import { isDarkToolbarTheme } from "./useToolbarTheme"
import { VIEWPORT_OPTIONS } from "./viewports"
import "../src/globals.css"

// main.ts aliases the auth client to its hand-written mock. every other api client is automocked, so each function is
// a spy that returns nothing until a story sets what it returns
sb.mock(import("@carlnotes/client/activityClient"))
sb.mock(import("@carlnotes/client/apiClient"))
sb.mock(import("@carlnotes/client/billingClient"))
sb.mock(import("@carlnotes/client/blockClient"))
sb.mock(import("@carlnotes/client/chatClient"))
sb.mock(import("@carlnotes/client/chatRoomClient"))
sb.mock(import("@carlnotes/client/flagContentClient"))
sb.mock(import("@carlnotes/client/mcpClient"))
sb.mock(import("@carlnotes/client/noteClient"))
sb.mock(import("@carlnotes/client/pageHeadClient"))
sb.mock(import("@carlnotes/client/podcastEpisodeClient"))
sb.mock(import("@carlnotes/client/profileClient"))
sb.mock(import("@carlnotes/client/reportClient"))
sb.mock(import("@carlnotes/client/teamClient"))
sb.mock(import("@carlnotes/client/termsClient"))
sb.mock(import("@carlnotes/client/topicClient"))
sb.mock(import("@carlnotes/client/voiceClient"))

// the preview runs on the app's own origin, so it keeps its storage in memory, and no story reads or changes a setting
// the user saved in the app
Object.defineProperty(globalThis, "localStorage", { value: toMemoryStorage(), configurable: true })
Object.defineProperty(globalThis, "sessionStorage", { value: toMemoryStorage(), configurable: true })

// one query client for every story, cleared before each so a story starts with an empty cache
const queryClient = new QueryClient({
	defaultOptions: { queries: { retry: false, staleTime: Number.POSITIVE_INFINITY } },
})

// the page's own origin, which no story may fetch from
const STORY_ORIGIN = globalThis.location.origin

// the axe rule tags of WCAG 2.0, 2.1, and 2.2 at levels A and AA, the bar every story is checked against
const WCAG_RULE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22a", "wcag22aa"]

// the card fill a story's surface parameter puts under a component, with the room a card gives its content
const CARD_SURFACE_STYLE = {
	background: "var(--card)",
	color: "var(--card-foreground)",
	padding: 16,
	borderRadius: toRadiusPixels("lg"),
}

// the header's dark hero band a story's surface parameter puts behind a header control, at the band's right end
const HERO_SURFACE_CLASS = "bg-hero text-hero-foreground"
const HERO_SURFACE_STYLE = { display: "flex", justifyContent: "flex-end", padding: 16 }

// the toolbar's light and dark themes, registered with the themes addon, which shows them in the toolbar
DecoratorHelpers.initializeThemeState(["light", "dark"], "light")

// a docs page's theme in each mode: the page fill, the text, the borders, and the links of that mode's palette, so the
// page and the stories on it sit on the app's page color
const DOCS_THEMES = { light: toDocsTheme("light", latte), dark: toDocsTheme("dark", darkRoast) }

// the html element of the docs page that this story's own frame sits on, or null for any other frame. a frame on
// another origin has no frame element, and the canvas's frame sits on the manager page, not in a docs page's root
const DOCS_PAGE_ROOT = window.frameElement?.closest("#storybook-docs") ? window.parent.document.documentElement : null

const preview: Preview = {
	tags: ["autodocs"],
	parameters: {
		// the accessibility addon fails a story on any violation of the WCAG 2 A and AA rules. axe's best-practice rules,
		// such as one main landmark and one h1 per page, judge a whole page, not a component shown alone
		a11y: { test: "error", options: { runOnly: { type: "tag", values: WCAG_RULE_TAGS } } },
		controls: { expanded: true },
		// every docs page, the MDX pages and the component pages, takes the toolbar's theme and the app's page fill
		docs: { container: ThemedDocsContainer },
		tanstack: { router: { context: { queryClient } } },
		viewport: { options: VIEWPORT_OPTIONS },
	},
	// before each story: an empty cache, the guarded fetch, and the scripted class unless the story shows the page
	// without JavaScript. fetch and the class are put back after the story
	beforeEach: ({ parameters }) => {
		queryClient.clear()
		const htmlClassList = document.documentElement.classList
		htmlClassList.toggle("scripted", parameters.hasJavaScript !== false)
		const originalFetch = globalThis.fetch
		globalThis.fetch = toGuardedFetch({ originalFetch, origin: STORY_ORIGIN })
		return () => {
			globalThis.fetch = originalFetch
			htmlClassList.remove("scripted")
		}
	},
	decorators: [
		// the light and dark toggle: the dark class on the html element before the story renders, as the app's head
		// script sets it before the first paint
		(Story, { globals, viewMode }) => {
			// a story in its own frame on a docs page follows the docs page's dark class
			if (DOCS_PAGE_ROOT) {
				return (
					<DocsPageTheme docsPageRoot={DOCS_PAGE_ROOT}>
						<Story />
					</DocsPageTheme>
				)
			}
			// any other story follows the toolbar, and a docs page's container sets the class for its inline stories
			const isDark = isDarkToolbarTheme(globals)
			if (viewMode !== "docs") {
				applyDarkClass(isDark)
			}
			return (
				<Fragment key={String(isDark)}>
					<Story />
				</Fragment>
			)
		},
		// the query client, the session the story names, the surface under the story, and the toast host unless the story
		// mounts its own
		(Story, { parameters }) => {
			const sessionName: StorySessionName = parameters.session ?? "visitor"
			return (
				<QueryClientProvider client={queryClient}>
					<StorySessionContext.Provider value={STORY_SESSIONS[sessionName]}>
						<StorySurface surface={parameters.surface}>
							<Story />
						</StorySurface>
						{parameters.hasToaster !== false && <Toaster />}
					</StorySessionContext.Provider>
				</QueryClientProvider>
			)
		},
	],
}

export default preview

// the fill a story's surface parameter puts under it: a card, the header's hero band, or the page alone
function StorySurface({ surface, children }: { surface?: "card" | "hero" | "page"; children: ReactNode }) {
	if (surface === "card") {
		return <div style={CARD_SURFACE_STYLE}>{children}</div>
	}
	if (surface === "hero") {
		return (
			<div className={HERO_SURFACE_CLASS} style={HERO_SURFACE_STYLE}>
				{children}
			</div>
		)
	}
	return children
}

// a docs page in the toolbar's theme. an MDX page has no story, so the container reads the toolbar's globals from the
// story store
function ThemedDocsContainer({ context, children }: PropsWithChildren<DocsContainerProps>) {
	// the toolbar's theme, on the html element and on the page
	const storyStore = (context as unknown as { store?: { userGlobals?: { get: () => { theme?: unknown } } } }).store
	const isDark = isDarkToolbarTheme(storyStore?.userGlobals?.get() ?? {})
	applyDarkClass(isDark)
	return (
		<DocsContainer context={context} theme={isDark ? DOCS_THEMES.dark : DOCS_THEMES.light}>
			{children}
		</DocsContainer>
	)
}

// a story in its own frame on a docs page, in the docs page's theme. the frame's url has no globals, so the story reads
// the docs page's dark class and remounts when it changes
function DocsPageTheme({ docsPageRoot, children }: { docsPageRoot: HTMLElement; children: ReactNode }) {
	// the docs page's theme, read again each time its html element's class changes
	const isDark = useSyncExternalStore(
		(onClassChange) => {
			const classObserver = new MutationObserver(onClassChange)
			classObserver.observe(docsPageRoot, { attributes: true, attributeFilter: ["class"] })
			return () => classObserver.disconnect()
		},
		() => docsPageRoot.classList.contains("dark"),
	)
	applyDarkClass(isDark)
	return <Fragment key={String(isDark)}>{children}</Fragment>
}

// put the dark class on the html element, or take it off, as the app's theme toggle does
function applyDarkClass(isDark: boolean): void {
	document.documentElement.classList.toggle("dark", isDark)
}

// the docs theme of one mode, drawn from that mode's palette
function toDocsTheme(base: "light" | "dark", palette: Palette): ThemeVars {
	return create({
		base,
		appContentBg: palette.background,
		appBorderColor: palette.border,
		textColor: palette.foreground,
		textMutedColor: palette.mutedForeground,
		colorSecondary: palette.link,
	})
}
