# Spec Delta

## REMOVED Requirements

### Requirement: The scanner runs as its own service reachable by the app and the worker

**Reason**: The LLM Guard scanner is removed from the app, the local stack, and CI. Production never ran it.

**Migration**: Deployments delete `LLM_GUARD_URL`, `LLM_GUARD_TIMEOUT_MS`, and `LLM_GUARD_INJECTION_THRESHOLD`.
