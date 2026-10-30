# Spec Delta

## REMOVED Requirements

### Requirement: A table file is screened before its table text is stored

**Reason**: The scanner is removed. A table file's rows reach every Scan prompt inside the nonce fence, the defense that
already held whenever the scanner was unset or failed open.

**Migration**: None. A table file's text is built from its extracted rows, with no redaction.
