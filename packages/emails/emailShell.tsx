// the shell every CarlNotes email renders inside: the brand header, the intro, the footer, a label as a link or as
// plain text, and the coffee-toned styles they share
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

// coffee-toned palette kept high-contrast and image-free so it renders well and stays out of spam filters
const main: CSSProperties = {
	backgroundColor: "#f4f1ea",
	fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
	padding: "24px 0",
}
const container: CSSProperties = {
	backgroundColor: "#ffffff",
	border: "1px solid #ece7de",
	borderRadius: "12px",
	margin: "0 auto",
	maxWidth: "600px",
	overflow: "hidden",
	padding: "8px 28px 24px",
}
const header: CSSProperties = { paddingTop: "20px" }
const brand: CSSProperties = { color: "#7c4a1e", fontSize: "18px", fontWeight: 700, margin: "0" }
// the brand, heading, and footer links all carry the coffee tones, underlined only in the small footer text
const brandLink: CSSProperties = { color: "#7c4a1e", textDecoration: "none" }
export const summaryLink: CSSProperties = { color: "#7c4a1e", textDecoration: "none", fontWeight: 600 }
export const footerBrandLink: CSSProperties = { color: "#7c4a1e", textDecoration: "underline" }
const cup: CSSProperties = { fontSize: "22px" }
const intro: CSSProperties = { paddingTop: "8px" }
const h1: CSSProperties = { color: "#2b2b2b", fontSize: "22px", fontWeight: 700, margin: "8px 0 4px" }
const summaryText: CSSProperties = { color: "#5b5b5b", fontSize: "15px", lineHeight: "1.5", margin: "0" }
const hr: CSSProperties = { borderColor: "#ece7de", margin: "24px 0 16px" }
const footerText: CSSProperties = { color: "#9a938a", fontSize: "12px", lineHeight: "1.5", margin: "0 0 6px" }
const footerLink: CSSProperties = { color: "#7c4a1e", fontSize: "12px" }
