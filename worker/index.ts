// the worker module entry. it exposes the topic scan, chat reply, and attachment functions that the api calls in-process
export {
	AttachmentValidationError,
	extractText,
	generateContext,
	generateImageContext,
	ingestAttachment,
	ingestUrlAttachment,
	MAX_ATTACHMENT_BYTES,
} from "./attach"
export { type ChatReplyStream, type ChatTurnInput, streamChatReply } from "./chat"
export { lookupPodcast } from "./ingest/podcast"
export { sendManualScanEmail } from "./notify"
export { loadScan, scanTopic, startTopicScan, stopTopicScan } from "./scan"
export { failStaleScans, runScheduledTopicScans } from "./schedule"
export { screenPendingSources, screenTopicSources } from "./screen"
export {
	attachmentExists,
	attachmentStream,
	deleteAttachment,
	getAttachmentBytes,
	putAttachment,
	toChatAttachmentKey,
	toChatRoomAttachmentKey,
} from "./store"
export { type SuggestedSource, suggestSources, toSourceKey } from "./suggest"
// trace the model-calls that the scheduled worker does
export { shutdownTelemetry, startTelemetry } from "./telemetry"
export { verifyUnsubscribeToken } from "./unsubscribe"
