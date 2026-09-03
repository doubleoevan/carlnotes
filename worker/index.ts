// the worker module entry. it exposes the topic scan, chat reply, and attachment functions that the api calls in-process
export {
	AttachmentValidationError,
	extractText,
	generateAttachmentContext,
	generateImageContext,
	ingestAttachment,
	ingestUrlAttachment,
	MAX_ATTACHMENT_BYTES,
	toCanonicalContentType,
} from "./attach"
export { type ChatReplyStream, type ChatTurnInput, streamChatReply } from "./chat"
export { lookupPodcast } from "./ingest/podcast"
export {
	fetchLinkPreviewImage,
	fetchLinkPreviewMetadata,
	type LinkPreviewMetaTags,
	toLinkPreviewUrls,
	toNormalizedLinkPreviewUrl,
} from "./linkPreview"
export { isBudgetRejection, MODEL_CHAT_TURN_FAILED_REJECTION, SPENT_BUDGET_REJECTION } from "./models"
export { sendManualScanEmail } from "./notify"
export { loadScan, scanTopic, startTopicScan, stopTopicScan } from "./scan"
export { failStaleScans, runScheduledTopicScans } from "./schedule"
export { toYoutubeVideoId } from "./scrape"
export { screenPendingSources, screenTopicSources } from "./screen"
export {
	attachmentExists,
	attachmentRangeStream,
	attachmentStream,
	deleteAttachment,
	getAttachmentBytes,
	toChatAttachmentKey,
	toChatRoomAttachmentKey,
	toLinkPreviewImageKey,
	uploadAttachment,
} from "./store"
export { type SuggestedSource, suggestSources, toSourceKey } from "./suggest"
// trace the model-calls that the scheduled worker does
export { shutdownTelemetry, startTelemetry } from "./telemetry"
export { verifyUnsubscribeToken } from "./unsubscribe"
