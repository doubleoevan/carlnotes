import { Fragment } from "react"

/**
 * Plain chat text that can break after each slash, so a long url wraps.
 */
export function SlashWrappedText({ text }: { text: string }) {
	// each text part is keyed by where it starts, and every part after the first follows its slash
	let nextTextPartStart = 0
	return text.split("/").map((textPart) => {
		const textPartStart = nextTextPartStart
		nextTextPartStart += textPart.length + 1
		return (
			<Fragment key={textPartStart}>
				{textPartStart > 0 && (
					<>
						/<wbr />
					</>
				)}
				{textPart}
			</Fragment>
		)
	})
}
