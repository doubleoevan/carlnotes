// the shell every CarlNotes email renders inside: the brand header, the intro, the footer, a label as a link or as
// plain text, and the styles they share, read from the Nightshift tokens
import { EMAIL_FONT_STACK, emailColors, toEmailFontSize } from "@carlnotes/nightshift/email"
import { Body, Container, Head, Heading, Hr, Html, Link, Preview, Section, Text } from "@react-email/components"
import type { CSSProperties, ReactElement, ReactNode } from "react"

/**
 * The shared page chrome every CarlNotes email renders inside: the inbox preheader, the tinted body, and the
 * brand header linking home.
 */
export function EmailShell({
	preview,
	appUrl,
	children,
}: {
	preview: string
	appUrl?: string
	children: ReactNode
}): ReactElement {
	return (
		<Html>
			<Head />
			<Preview>{preview}</Preview>
			<Body style={main}>
				<Container style={container}>
					{/* the CarlNotes brand header, linking home */}
					<Section style={header}>
						<Text style={brand}>
							<span style={cup}>{"☕ "}</span>
							<LinkOrText href={appUrl} style={brandLink}>
								CarlNotes
							</LinkOrText>
						</Text>
					</Section>
					{children}
				</Container>
			</Body>
		</Html>
	)
}

/**
 * An email's heading and the lead sentence under it.
 */
export function EmailIntro({ heading, children }: { heading: string; children: ReactNode }): ReactElement {
	return (
		<Section style={intro}>
			<Heading style={h1}>{heading}</Heading>
			<Text style={summaryText}>{children}</Text>
		</Section>
	)
}

/**
 * The rule and small print that close an email, with the unsubscribe link only when the caller has one.
 */
export function EmailFooter({
	unsubscribeUrl,
	children,
}: {
	unsubscribeUrl?: string
	children: ReactNode
}): ReactElement {
	return (
		<>
			<Hr style={hr} />
			<Section>
				<Text style={footerText}>{children}</Text>
				{unsubscribeUrl ? (
					<Link href={unsubscribeUrl} style={footerLink}>
						Unsubscribe
					</Link>
				) : null}
			</Section>
		</>
	)
}

/**
 * A label as a link when its url is known, and as plain text when it is not,
 * so the email still reads without an app base url configured.
 */
export function LinkOrText({
	href,
	style,
	children,
}: {
	href?: string
	style: CSSProperties
	children: ReactNode
}): ReactElement {
	return href ? (
		<Link href={href} style={style}>
			{children}
		</Link>
	) : (
		// biome-ignore lint/complexity/noUselessFragments: children is a ReactNode, not assignable to the declared ReactElement return type on its own
		<>{children}</>
	)
}

// the Latte palette, kept high-contrast and image-free so it renders well and stays out of spam filters
const main: CSSProperties = {
	backgroundColor: emailColors.secondary,
	fontFamily: EMAIL_FONT_STACK,
	padding: "24px 0",
}
const container: CSSProperties = {
	backgroundColor: emailColors.card,
	border: `1px solid ${emailColors.muted}`,
	borderRadius: "12px",
	margin: "0 auto",
	maxWidth: "600px",
	overflow: "hidden",
	padding: "8px 28px 24px",
}
const header: CSSProperties = { paddingTop: "20px" }
const brand: CSSProperties = {
	color: emailColors.link,
	fontSize: toEmailFontSize("sectionHeading"),
	fontWeight: 700,
	margin: "0",
}
// the brand, heading, and footer links all use the email's link color, underlined only in the small footer text
const brandLink: CSSProperties = { color: emailColors.link, textDecoration: "none" }
export const summaryLink: CSSProperties = { color: emailColors.link, textDecoration: "none", fontWeight: 600 }
export const footerBrandLink: CSSProperties = { color: emailColors.link, textDecoration: "underline" }
const cup: CSSProperties = { fontSize: toEmailFontSize("pageTitle") }
const intro: CSSProperties = { paddingTop: "8px" }
const h1: CSSProperties = {
	color: emailColors.foreground,
	fontSize: toEmailFontSize("pageTitle"),
	fontWeight: 700,
	margin: "8px 0 4px",
}
// the primary paragraph text in the foreground color, at the body and bodyLarge sizes
export const bodyText: CSSProperties = {
	color: emailColors.foreground,
	fontSize: toEmailFontSize("body"),
	lineHeight: "1.5",
}
export const bodyLargeText: CSSProperties = { ...bodyText, fontSize: toEmailFontSize("bodyLarge") }
const summaryText: CSSProperties = {
	color: emailColors.secondaryForeground,
	fontSize: toEmailFontSize("bodyLarge"),
	lineHeight: "1.5",
	margin: "0",
}
// the divider in the muted fill. a whole borderTop replaces the one react-email writes by default
const hr: CSSProperties = { borderTop: `1px solid ${emailColors.muted}`, margin: "24px 0 16px" }
export const footerText: CSSProperties = {
	color: emailColors.mutedForeground,
	fontSize: toEmailFontSize("caption"),
	lineHeight: "1.5",
	margin: "0 0 6px",
}
const footerLink: CSSProperties = { color: emailColors.link, fontSize: toEmailFontSize("caption") }
