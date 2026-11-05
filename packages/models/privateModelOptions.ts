// private text is processed by the model but excluded from SDK and proxy content telemetry
// LiteLLM's per-request redaction retains billing metadata: https://docs.litellm.ai/docs/proxy/logging
export const PRIVATE_MODEL_OPTIONS = {
	headers: { "x-litellm-enable-message-redaction": "true" },
	telemetry: { isEnabled: false, recordInputs: false, recordOutputs: false },
} as const
