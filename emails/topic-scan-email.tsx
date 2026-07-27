// the topic-scan email: a designed, deliverable summary of a scheduled Scan's new Findings.
// authored as a react-email template, so it can be previewed with `bun run dev:email` and rendered to html at send time
import { Body, Container, Head, Heading, Hr, Html, Link, Preview, Section, Text } from "@react-email/components"
import { render } from "@react-email/render"
import type { CSSProperties, ReactElement, ReactNode } from "react"

// a new Finding as the email lists it, and the full set of props that the template renders from
export type TopicScanEmailFinding = { title: string | null; url: string; relevanceExplanation: string }
export type TopicScanEmailProps = {
	topicName: string
	// how many new Findings this scan surfaced. the summary line and the inbox preheader are both written from it
	findingCount: number
	findings: TopicScanEmailFinding[]
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
	appUrl,
	topicUrl,
	unsubscribeUrl,
}: TopicScanEmailProps): ReactElement {
	return (
		<Html>
			<Head />
			{/* the inbox preheader is the same sentence as the summary line, without the link */}
			<Preview>{`${summaryLead(findingCount)}${topicName}.`}</Preview>
			<Body style={main}>
				<Container style={container}>
					{/* the CarlNotes brand header, linking home */}
					<Section style={header}>
						<Text style={brand}>
							<span style={cup}>☕</span>{" "}
							<LinkOrText href={appUrl} style={brandLink}>
								CarlNotes
							</LinkOrText>
						</Text>
					</Section>

					{/* the topic heading, then Carl's one-line summary with the topic name linking to its page */}
					<Section style={intro}>
						<Heading style={h1}>Notes on {topicName}</Heading>
						<Text style={summaryText}>
							{summaryLead(findingCount)}
							<LinkOrText href={topicUrl} style={summaryLink}>
								{topicName}
							</LinkOrText>
							.
						</Text>
					</Section>

					{/* one card per new Finding: title, host, and why it matters */}
					<Section>
						{findings.map((finding) => (
							<Section key={finding.url} style={card}>
								<Link href={finding.url} style={cardTitle}>
									{finding.title ?? finding.url}
								</Link>
								<Text style={cardHost}>{hostOf(finding.url)}</Text>
								{finding.relevanceExplanation ? <Text style={cardNote}>{finding.relevanceExplanation}</Text> : null}
							</Section>
						))}
					</Section>

					<Hr style={hr} />

					{/* the footer with the one-click unsubscribe link */}
					<Section>
						<Text style={footerText}>
							You're receiving this because you subscribe to emails for{" "}
							<LinkOrText href={topicUrl} style={footerBrandLink}>
								{topicName}
							</LinkOrText>{" "}
							on{" "}
							<LinkOrText href={appUrl} style={footerBrandLink}>
								CarlNotes
							</LinkOrText>
							.
						</Text>
						{unsubscribeUrl ? (
							<Link href={unsubscribeUrl} style={footerLink}>
								Unsubscribe
							</Link>
						) : null}
					</Section>
				</Container>
			</Body>
		</Html>
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
	const noun = findingCount === 1 ? "thing" : "things"
	return `Carl brewed a fresh cup of ${findingCount} new ${noun} worth your time on `
}

// a label as a link when its url is known, and as plain text when it is not, so the email still reads without an app base url configured
function LinkOrText({ href, style, children }: { href?: string; style: CSSProperties; children: ReactNode }) {
	return href ? (
		<Link href={href} style={style}>
			{children}
		</Link>
	) : (
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
const summaryLink: CSSProperties = { color: "#7c4a1e", textDecoration: "none", fontWeight: 600 }
const footerBrandLink: CSSProperties = { color: "#7c4a1e", textDecoration: "underline" }
const cup: CSSProperties = { fontSize: "22px" }
const intro: CSSProperties = { paddingTop: "8px" }
const h1: CSSProperties = { color: "#2b2b2b", fontSize: "22px", fontWeight: 700, margin: "8px 0 4px" }
const summaryText: CSSProperties = { color: "#5b5b5b", fontSize: "15px", lineHeight: "1.5", margin: "0" }
const card: CSSProperties = {
	backgroundColor: "#faf8f4",
	border: "1px solid #efeae0",
	borderRadius: "10px",
	marginTop: "12px",
	padding: "14px 16px",
}
const cardTitle: CSSProperties = { color: "#7c4a1e", fontSize: "16px", fontWeight: 600, textDecoration: "none" }
const cardHost: CSSProperties = { color: "#a79c8c", fontSize: "12px", margin: "2px 0 0" }
const cardNote: CSSProperties = { color: "#4b4b4b", fontSize: "14px", lineHeight: "1.5", margin: "8px 0 0" }
const hr: CSSProperties = { borderColor: "#ece7de", margin: "24px 0 16px" }
const footerText: CSSProperties = { color: "#9a938a", fontSize: "12px", lineHeight: "1.5", margin: "0 0 6px" }
const footerLink: CSSProperties = { color: "#7c4a1e", fontSize: "12px" }
