## MODIFIED Requirements

### Requirement: Updates and Scan status results are fenced

Every text a page or a model wrote in a `read_updates`, `start_scan`, or `read_scan_status` result SHALL be fenced with
a per-call nonce in both its text and its structured content: the recap, each Finding's title, url, source, Topic name,
and explanation, and the Topic's name, each Source's label, and the Scan's summary. The MCP view SHALL read the plain
copy from its `_meta` data, which the model does not read.

#### Scenario: A page's title holds an instruction

- **WHEN** a Finding's title tells the model to do something
- **THEN** the title arrives inside its fence in both representations, and the MCP view shows it as written
