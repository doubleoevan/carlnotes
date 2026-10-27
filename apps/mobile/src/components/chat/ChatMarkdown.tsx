// biome-ignore-all lint/suspicious/noArrayIndexKey: streamed blocks and read-only fields retain their positions while text appends
import { toNativeChatMarkdown } from "@carlnotes/core/lib/nativeChatMarkdown"
import { isSafeHref } from "@carlnotes/core/lib/safeChatMarkdown"
import { colors } from "@carlnotes/nightshift/colors"
import { fontFamilies } from "@carlnotes/nightshift/typography"
import { type ComponentProps, useMemo } from "react"
import { View } from "react-native"
import { EnrichedMarkdownText } from "react-native-enriched-markdown"
import { useUniwind } from "uniwind"
import { openExternalLink } from "@/components/common/AnchorLink"
import { useIsReduceMotionEnabled } from "@/hooks/useIsReduceMotionEnabled"

type MarkdownStyle = ComponentProps<typeof EnrichedMarkdownText>["markdownStyle"]

/**
 * Renders safe streamed answers with native text and labeled cards for generated tables.
 */
export function ChatMarkdown({ markdown, isStreaming = false }: { markdown: string; isStreaming?: boolean }) {
	// parse safe content once per chunk and resolve colors once per theme
	const { theme } = useUniwind()
	const isReduceMotionEnabled = useIsReduceMotionEnabled()
	const markdownStyle = useMemo(() => toMarkdownStyle(theme === "dark" ? "dark" : "light"), [theme])
	const chatMarkdownSegments = useMemo(() => toNativeChatMarkdown(markdown, isStreaming), [markdown, isStreaming])
	return (
		<View className="gap-1.5">
			{chatMarkdownSegments.map((segment, index) =>
				segment.kind === "markdown" ? (
					<EnrichedMarkdownText
						key={`text-${index}`}
						markdown={segment.markdown}
						markdownStyle={markdownStyle}
						flavor="github"
						streamingAnimation={isStreaming && !isReduceMotionEnabled}
						streamingConfig={{ tableMode: "hidden", codeBlockMode: "progressive" }}
						enableLinkPreview={false}
						enableTaskListItemToggle={false}
						onLinkPress={handleLink}
						onLinkLongPress={handleLink}
					/>
				) : (
					<View key={`table-${index}`} className="gap-2">
						{segment.rows.map((row, rowIndex) => (
							<View key={`row-${rowIndex}`} className="gap-2 rounded-lg border border-border bg-card p-3">
								{row.map((field, column) => (
									<View key={`cell-${column}`} className="gap-1">
										<EnrichedMarkdownText
											markdown={`**${field.label}**`}
											markdownStyle={markdownStyle}
											enableLinkPreview={false}
											enableTaskListItemToggle={false}
											onLinkPress={handleLink}
											onLinkLongPress={handleLink}
										/>
										<EnrichedMarkdownText
											markdown={field.value || "—"}
											markdownStyle={markdownStyle}
											enableLinkPreview={false}
											enableTaskListItemToggle={false}
											onLinkPress={handleLink}
											onLinkLongPress={handleLink}
										/>
									</View>
								))}
							</View>
						))}
					</View>
				),
			)}
		</View>
	)
}

// guard both press paths before opening an external destination
function handleLink({ url }: { url: string }): void {
	if (isSafeHref(url)) {
		void openExternalLink(url)
	}
}

// resolve Nightshift values once per appearance change, leaving text scaling to native Markdown
function toMarkdownStyle(mode: "light" | "dark"): MarkdownStyle {
	const bodyStyle = {
		fontFamily: fontFamilies.sans.name,
		fontSize: 14,
		lineHeight: 22,
		color: colors.foreground[mode],
		marginTop: 0,
		marginBottom: 6,
	}
	return {
		paragraph: bodyStyle,
		h1: { ...bodyStyle, fontSize: 20, fontWeight: "bold" },
		h2: { ...bodyStyle, fontSize: 18, fontWeight: "bold" },
		h3: { ...bodyStyle, fontSize: 16, fontWeight: "bold" },
		h4: bodyStyle,
		h5: bodyStyle,
		h6: bodyStyle,
		list: bodyStyle,
		blockquote: { ...bodyStyle, borderColor: colors.border[mode] },
		link: { color: colors.link[mode], underline: true },
		code: { color: colors.foreground[mode], backgroundColor: colors.muted[mode] },
		codeBlock: { ...bodyStyle, backgroundColor: colors.muted[mode] },
	}
}
