// the worker module entry. it exposes the topic scan, chat reply, and attachment functions that the api calls in-process
export {
	AttachmentValidationError,
	extractText,
	generateContext,
	generateImageContext,
	ingestAttachment,
	MAX_ATTACHMENT_BYTES,
} from "./attach"
export { type ChatReplyStream, type ChatTurnInput, streamChatReply } from "./chat"
export { sendManualScanEmail } from "./notify"
export { loadScan, scanTopic, startTopicScan } from "./scan"
export { failStaleScans, runScheduledTopicScans } from "./schedule"
export { attachmentStream, deleteAttachment, putAttachment, toChatAttachmentKey } from "./store"
// trace the model-calls that the scheduled worker does
export { shutdownTelemetry, startTelemetry } from "./telemetry"
export { verifyUnsubscribeToken } from "./unsubscribe"
