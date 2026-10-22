// the viewports the component browser offers, and the globals that show a story at the app's phone width
import { MINIMAL_VIEWPORTS } from "storybook/viewport"

// the name of the phone viewport
const PHONE_VIEWPORT_NAME = "phone"

/** The viewports the component browser offers: Storybook's own sizes and the phone the app is checked at. */
export const VIEWPORT_OPTIONS = {
	...MINIMAL_VIEWPORTS,
	[PHONE_VIEWPORT_NAME]: {
		name: "Phone, 375 pixels",
		styles: { width: "375px", height: "812px" },
		type: "mobile" as const,
	},
}

/** The globals that show a story on the 375-pixel-wide phone, held upright. */
export const PHONE_VIEWPORT_GLOBALS = { viewport: { value: PHONE_VIEWPORT_NAME, isRotated: false } }
