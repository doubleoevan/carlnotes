// the topic-scan email: a designed, deliverable summary of a scheduled Scan's new Findings.
// authored as a react-email template, so it can be previewed with `bun run dev:email` and rendered to html at send time
import { Body, Container, Head, Heading, Hr, Html, Link, Preview, Section, Text } from "@react-email/components"
import { render } from "@react-email/render"
import Markdown from "markdown-to-jsx"
import type { CSSProperties, ReactElement, ReactNode } from "react"

// the urls a recap may link to: this email's own Finding urls
export type AllowedNoteUrls = ReadonlySet<string>

// a new Finding as the email lists it, and the full set of props that the template renders from
export type TopicScanEmailFinding = { title: string | null; url: string; relevanceExplanation: string }
export type TopicScanEmailProps = {
	topicName: string
	// how many new Findings this scan surfaced. the summary line and the inbox preheader are both written from it
	findingCount: number
	findings: TopicScanEmailFinding[]
	// Carl's recap of this scan as plain text, omitted when the scan never wrote one
	scanSummary?: string
	// the urls the recap may link: the Topic's own Findings, which is a wider set than this scan's new ones
	// because the recap is written before the Topic is trimmed to its result cap. anything else stays plain text
	allowedSummaryUrls?: string[]
	// the app's home and this topic's page. both omitted when the app base url isn't configured, and the labels render as plain text
	appUrl?: string
	topicUrl?: string
	// the recipient's signed one-click unsubscribe link, omitted when the app base url isn't configured
	unsubscribeUrl?: string
}

// the template. a header, a one-line summary, spaced Finding cards, and a plain footer
export default function TopicScanEmail({
	topicName,
	findingCount,
	findings,
	scanSummary,
	allowedSummaryUrls,
	appUrl,
	topicUrl,
	unsubscribeUrl,
}: TopicScanEmailProps): ReactElement {
	return (
		// the inbox preheader is the same sentence as the summary line, without the link
		<EmailShell preview={`${summaryLead(findingCount)}${topicName}.${closingNote(findingCount)}`} appUrl={appUrl}>
			{/* the topic heading, then Carl's one-line summary with the topic name linking to its page */}
			<EmailIntro heading={`Notes on ${topicName}`}>
				{summaryLead(findingCount)}
				<LinkOrText href={topicUrl} style={summaryLink}>
					{topicName}
				</LinkOrText>
				.{closingNote(findingCount)}
			</EmailIntro>

			<ScanSummarySection
				scanSummary={scanSummary}
				allowedUrls={new Set(allowedSummaryUrls ?? findings.map((finding) => finding.url))}
			/>
			<FindingCards findings={findings} />

			{/* the footer with the one-click unsubscribe link */}
			<EmailFooter unsubscribeUrl={unsubscribeUrl}>
				{"You're receiving this because you subscribe to emails for "}
				<LinkOrText href={topicUrl} style={footerBrandLink}>
					{topicName}
				</LinkOrText>
				{" on "}
				<LinkOrText href={appUrl} style={footerBrandLink}>
					CarlNotes
				</LinkOrText>
				{"."}
			</EmailFooter>
		</EmailShell>
	)
}

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
 * AI recap of a scan, rendered above the findings.
 * It renders through the sanitized Markdown subset: formatting survives, but a link only works when it cites
 * one of this email's own Finding urls — everything else renders as inert text.
 */
export function ScanSummarySection({
	scanSummary,
	allowedUrls,
}: {
	scanSummary?: string
	allowedUrls?: AllowedNoteUrls
}): ReactElement | null {
	// a scan that failed to summarize is sent without the block instead of an empty one
	if (!scanSummary) {
		return null
	}
	return (
		<Section style={summaryCard}>
			<Text style={summaryLabel}>{"Carl's notes"}</Text>
			<Markdown options={toSummaryMarkdownOptions(allowedUrls)}>{scanSummary}</Markdown>
		</Section>
	)
}

// a finding link in a note. it renders as an anchor only for this email's own Finding urls,
// and otherwise prints its label and destination as plain text
function FindingLink({
	children,
	href,
	allowedUrls,
}: {
	children?: ReactNode
	href?: string
	allowedUrls?: AllowedNoteUrls
}): ReactElement {
	// an allowed url renders as a link
	if (href && allowedUrls?.has(href)) {
		return (
			<Link href={href} style={summaryLink}>
				{children}
			</Link>
		)
	}

	// anything else prints its label and destination as plain text
	// markdown-to-jsx hands the label over as a one-string array, but a bare string reads the same way here
	const [firstChild] = Array.isArray(children) ? children : [children]
	const label = typeof firstChild === "string" ? firstChild : null
	return (
		<span>
			{children}
			{href && href !== label ? ` (${href})` : ""}
		</span>
	)
}

/**
 * One card per new Finding, numbered by the rank the caller's query already sorted them in.
 */
export function FindingCards({ findings }: { findings: TopicScanEmailFinding[] }): ReactElement {
	return (
		<Section>
			{findings.map((finding, index) => (
				<Section key={finding.url} style={card}>
					<Link href={finding.url} style={cardTitle}>
						<span style={cardNumber}>{index + 1}. </span>
						{finding.title ?? finding.url}
					</Link>
					<Text style={cardHost}>{hostOf(finding.url)}</Text>
					{finding.relevanceExplanation ? <Text style={cardNote}>{finding.relevanceExplanation}</Text> : null}
				</Section>
			))}
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

// sample data the `dev:email` preview renders, so the template shows real-looking content while you design
TopicScanEmail.PreviewProps = {
	topicName: "LLM tooling",
	findingCount: 3,
	findings: [
		{
			title: "Things I've learned building LLM apps",
			url: "https://simonwillison.net/2026/Jan/12/building-with-llms/",
			relevanceExplanation:
				"A practical retrospective on shipping LLM features — prompt versioning, eval harnesses, and cost controls — arguing embeddings-based retrieval beats fine-tuning for most apps.",
		},
		{
			title: "Structured output is finally reliable",
			url: "https://simonwillison.net/2026/Jan/9/structured-output/",
			relevanceExplanation:
				"Benchmarks the new JSON-schema output modes across Claude and GPT with near-total schema adherence, relevant to the retrieval and agents angle.",
		},
		{
			title: null,
			url: "https://simonwillison.net/2026/Jan/5/embeddings/",
			relevanceExplanation: "A deep dive on embedding models and the dimensionality trade-offs behind them.",
		},
	],
	scanSummary:
		"Structured output finally landed, and the eval tooling caught up with it.\n\n**The numbers:** $0.04 spent, 1 near-duplicate filtered, 20 read and 3 kept.\n\nWhat earned their spots: Simon's retrospective is the practical one — prompt versioning and cost controls you can copy today. The structured-output benchmarks matter because they close the loop on schema adherence, which is what made the old parsing workarounds necessary.\n\nSources: https://simonwillison.net/2026/Jan/12/building-with-llms/",
	appUrl: "https://carlnotes.example.com",
	topicUrl: "https://carlnotes.example.com/topics/preview-topic",
	unsubscribeUrl: "https://carlnotes.example.com/api/unsubscribe?token=preview",
} satisfies TopicScanEmailProps

// render the template to an HTML string for sending. the worker calls this at send-email time
export function renderTopicScanEmail(props: TopicScanEmailProps): Promise<string> {
	return render(<TopicScanEmail {...props} />)
}

// summary line up to the topic name that closes it. the visible line links that name, the preheader does not
function summaryLead(findingCount: number): string {
	if (findingCount === 0) {
		return "Carl brewed a fresh pot and found nothing new worth your time on "
	}
	const noun = findingCount === 1 ? "finding" : "findings"
	return `Carl brewed a fresh cup of ${findingCount} new ${noun} worth your time on `
}

// a scan that came up empty gets Carl's aside in his own voice, so an empty email still reads as intentional
function closingNote(findingCount: number): string {
	return findingCount === 0 ? " Carl has high standards." : ""
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

// the root domain of a url for the muted line under each title, falling back to the url itself
function hostOf(url: string): string {
	try {
		return new URL(url).hostname.replace(/^www\./, "")
	} catch {
		return url
	}
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
// the recap block, tinted a shade warmer than the finding cards so it reads as Carl's voice instead of another link
const summaryCard: CSSProperties = {
	backgroundColor: "#f7f2e9",
	border: "1px solid #ece2d2",
	borderRadius: "10px",
	marginTop: "16px",
	padding: "14px 16px",
}
const summaryLabel: CSSProperties = {
	color: "#a79c8c",
	fontSize: "11px",
	letterSpacing: "0.06em",
	margin: "0 0 6px",
	textTransform: "uppercase",
}
const summaryBody: CSSProperties = { color: "#4b4b4b", fontSize: "14px", lineHeight: "1.5", margin: "6px 0" }
// the model picks its own heading levels, so every one is pinned to the same compact inline-styled scale
const summaryHeading: CSSProperties = { color: "#2b2b2b", fontSize: "15px", fontWeight: 700, margin: "10px 0 4px" }
function toSummaryMarkdownOptions(allowedUrls?: AllowedNoteUrls) {
	return {
		disableParsingRawHTML: true,
		overrides: {
			h1: { props: { style: summaryHeading } },
			h2: { props: { style: summaryHeading } },
			h3: { props: { style: summaryHeading } },
			h4: { props: { style: summaryHeading } },
			p: { props: { style: summaryBody } },
			ul: { props: { style: { ...summaryBody, paddingLeft: "18px" } } },
			ol: { props: { style: { ...summaryBody, paddingLeft: "18px" } } },
			li: { props: { style: { margin: "2px 0" } } },
			strong: { props: { style: { color: "#2b2b2b", fontWeight: 600 } } },
			a: { component: FindingLink, props: { allowedUrls } },
			img: { component: (): null => null },
		},
	}
}
const card: CSSProperties = {
	backgroundColor: "#faf8f4",
	border: "1px solid #efeae0",
	borderRadius: "10px",
	marginTop: "12px",
	padding: "14px 16px",
}
const cardTitle: CSSProperties = { color: "#7c4a1e", fontSize: "16px", fontWeight: 600, textDecoration: "none" }
// the same muted tone as cardHost, so the rank reads as a label instead of part of the link itself
const cardNumber: CSSProperties = { color: "#a79c8c", fontWeight: 400 }
const cardHost: CSSProperties = { color: "#a79c8c", fontSize: "12px", margin: "2px 0 0" }
const cardNote: CSSProperties = { color: "#4b4b4b", fontSize: "14px", lineHeight: "1.5", margin: "8px 0 0" }
const hr: CSSProperties = { borderColor: "#ece7de", margin: "24px 0 16px" }
const footerText: CSSProperties = { color: "#9a938a", fontSize: "12px", lineHeight: "1.5", margin: "0 0 6px" }
const footerLink: CSSProperties = { color: "#7c4a1e", fontSize: "12px" }
