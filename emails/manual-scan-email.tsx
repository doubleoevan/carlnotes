// the manual-scan email: what a Scan you triggered yourself turned up, sent when it finishes because it takes several minutes.
// the shell, cards, and footer are the topic-scan email's, so the two stay visually identical
import { Section, Text } from "@react-email/components"
import { render } from "@react-email/render"
import type { CSSProperties, ReactElement } from "react"
import {
	EmailFooter,
	EmailIntro,
	EmailShell,
	FindingCards,
	footerBrandLink,
	LinkOrText,
	ScanSummarySection,
	summaryLink,
	type TopicScanEmailFinding,
} from "./topic-scan-email"

// the topic and links every manual-scan email includes, plus the outcome that decides what the body says.
// allowedSummaryUrls are the urls the recap may link: the Topic's own Findings
export type ManualScanEmailProps = {
	topicName: string
	// the app's home and this topic's page urls. both omitted when the app base url isn't configured
	appUrl?: string
	topicUrl?: string
} & (
	| { status: "succeeded"; findings: TopicScanEmailFinding[]; scanSummary?: string; allowedSummaryUrls?: string[] }
	| { status: "failed"; failureReason: string }
)

// the template. the brand header, what the scan turned up, and a footer saying you triggered the scan
export default function ManualScanEmail(props: ManualScanEmailProps): ReactElement {
	const { topicName, appUrl, topicUrl } = props
	return (
		<EmailShell preview={toPreview(props)} appUrl={appUrl}>
			{/* the heading, then the outcome in one sentence with the topic name linking to its page */}
			<EmailIntro heading={toHeading(props)}>
				{toSummaryLead(props)}
				<LinkOrText href={topicUrl} style={summaryLink}>
					{topicName}
				</LinkOrText>
				.{toClosingNote(props)}
			</EmailIntro>

			{/* a succeeded scan shows the AI recap summary and its findings. a failed one says what stopped it */}
			{props.status === "succeeded" ? (
				<>
					<ScanSummarySection
						scanSummary={props.scanSummary}
						allowedUrls={new Set(props.allowedSummaryUrls ?? props.findings.map((finding) => finding.url))}
					/>
					<FindingCards findings={props.findings} />
				</>
			) : (
				<Section style={failureCard}>
					<Text style={failureText}>{props.failureReason}</Text>
					<Text style={failureNote}>Carl will keep trying on this topic's schedule.</Text>
				</Section>
			)}

			{/* no unsubscribe link, since this email reports a scan the user triggered instead of a scheduled subscription */}
			<EmailFooter>
				{`You're receiving this because you started this brew yourself on `}
				<LinkOrText href={appUrl} style={footerBrandLink}>
					CarlNotes
				</LinkOrText>
				.
			</EmailFooter>
		</EmailShell>
	)
}

// sample data the `dev:email` preview renders, so the template shows real-looking content to preview
ManualScanEmail.PreviewProps = {
	status: "succeeded",
	topicName: "LLM tooling",
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
	],
	scanSummary:
		"Structured output finally landed, and the eval tooling caught up with it.\n\n**The numbers:** $0.04 spent, 1 near-duplicate filtered, 14 read and 2 kept.\n\n**Skim.** Both worth reading now.",
	appUrl: "https://carlnotes.example.com",
	topicUrl: "https://carlnotes.example.com/topics/preview-topic",
} satisfies ManualScanEmailProps

// render the template to an HTML string for sending. the worker calls this at send-email time
export function renderManualScanEmail(props: ManualScanEmailProps): Promise<string> {
	return render(<ManualScanEmail {...props} />)
}

// the same email as plain text, sent with the HTML. a message with no text part reads as machine-generated and goes to a spam filter.
// also, some clients and screen readers show this instead of HTML
export function renderManualScanEmailText(props: ManualScanEmailProps): Promise<string> {
	return render(<ManualScanEmail {...props} />, { plainText: true })
}

// the subject line, so the sender and the template never describe the same scan differently
export function toManualScanSubject(props: ManualScanEmailProps): string {
	return props.status === "succeeded"
		? `Your brew of ${props.topicName} is ready`
		: `Your brew of ${props.topicName} didn't finish`
}

// the heading over the body
function toHeading(props: ManualScanEmailProps): string {
	return props.status === "succeeded" ? `Notes on ${props.topicName}` : `No notes on ${props.topicName}`
}

// the summary line, up to the topic name that closes it
function toSummaryLead(props: ManualScanEmailProps): string {
	// a failed scan leads shows what happened instead of a count
	if (props.status === "failed") {
		return "Carl couldn't finish the brew you started on "
	}
	if (props.findings.length === 0) {
		return "Carl finished the brew you started and found nothing new worth your time on "
	}

	// a scan that turned something up counts it
	const noun = props.findings.length === 1 ? "finding" : "findings"
	return `Carl finished the brew you started, with ${props.findings.length} new ${noun} worth your time on `
}

// the inbox preheader: the same sentence as the summary line, without the link
function toPreview(props: ManualScanEmailProps): string {
	return `${toSummaryLead(props)}${props.topicName}.${toClosingNote(props)}`
}

// a scan that came up empty gets an explanation, so an empty result still reads as intentional
function toClosingNote(props: ManualScanEmailProps): string {
	return props.status === "succeeded" && props.findings.length === 0 ? " Carl has high standards." : ""
}

// the failure block, tinted like the recap card so a scan that turned up nothing, still reads as a finished note
const failureCard: CSSProperties = {
	backgroundColor: "#f7f2e9",
	border: "1px solid #ece2d2",
	borderRadius: "10px",
	marginTop: "16px",
	padding: "14px 16px",
}
const failureText: CSSProperties = { color: "#4b4b4b", fontSize: "15px", lineHeight: "1.5", margin: "0" }
const failureNote: CSSProperties = { color: "#a79c8c", fontSize: "13px", lineHeight: "1.5", margin: "6px 0 0" }
