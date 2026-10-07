// the attachment summaries eval's promptfoo provider, which runs the summary writers under test
import { renderAsync } from "@resvg/resvg-js"
import type { ApiProvider, CallApiContextParams, ProviderResponse } from "promptfoo"
import { generateAttachmentContext, generateImageContext, toDataUrl } from "../../worker/attach"
import type { DocumentAttachment, ImageAttachment } from "./attachmentSummariesCases"

// the variables that a case gives the writer. its attachment, a document or an image
export type AttachmentSummariesVariables = DocumentAttachment | ImageAttachment

// the summary writer under test. the writer's output is the summary stored as the attachment's context
export const attachmentSummariesWriter: ApiProvider = {
	id: () => "attachment-summaries-writer",
	callApi: writeCaseAttachmentSummary,
}

// write one case's summary through the same function that the app calls for the attachment's kind
async function writeCaseAttachmentSummary(
	_renderedPrompt: string,
	context?: CallApiContextParams,
): Promise<ProviderResponse> {
	// summarize a document's text on the cheap model
	const attachmentSummariesVariables = context?.vars as AttachmentSummariesVariables
	if (attachmentSummariesVariables.attachmentKind === "document") {
		return { output: await generateAttachmentContext(attachmentSummariesVariables.documentText) }
	}

	// draw an image's svg as a png, and describe the png on the chat model
	const imagePng = await toImagePng(attachmentSummariesVariables.imageSvg)
	return { output: await generateImageContext(toDataUrl("image/png", imagePng)) }
}

// draw an svg as png bytes. the system fonts load, so the image's text renders
async function toImagePng(imageSvg: string): Promise<Uint8Array> {
	const renderedImage = await renderAsync(imageSvg, { font: { loadSystemFonts: true } })
	return renderedImage.asPng()
}
