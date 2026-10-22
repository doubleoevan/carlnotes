// the legal-page typography that the terms and privacy pages share: display-font section headings, foreground body
import { AnchorLink } from "@/components/common/AnchorLink"

// the Markdown renderer's options for a legal page body
export const LEGAL_MARKDOWN_OPTIONS = {
	disableAutoLink: true,
	overrides: {
		h2: { props: { className: "font-display mt-8 mb-1 text-lg" } },
		p: { props: { className: "mt-3 text-sm leading-relaxed" } },
		ul: { props: { className: "mt-3 list-disc space-y-1.5 pl-5 text-sm leading-relaxed" } },
		li: { props: { className: "leading-relaxed" } },
		a: { component: AnchorLink, props: { className: "sentence-link" } },
	},
} as const
