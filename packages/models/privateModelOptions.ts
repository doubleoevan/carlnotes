// exclude private inputs and outputs from the app's AI SDK telemetry
export const PRIVATE_MODEL_OPTIONS = {
	telemetry: { isEnabled: false, recordInputs: false, recordOutputs: false },
} as const
