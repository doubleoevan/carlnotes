// the style that the api's own pages start with, in the emails' palette so the page reads as the same sender
import { EMAIL_FONT_STACK, emailColors } from "@carlnotes/nightshift/email"

// the body and link rules that the api's own pages share. a page adds its own rules after them
export const API_PAGE_BASE_STYLE = `
	body { margin: 0; background: ${emailColors.secondary}; color: ${emailColors.foreground}; font-family: ${EMAIL_FONT_STACK}; }
	a { color: ${emailColors.link}; }
`
