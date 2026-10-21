## MODIFIED Requirements

### Requirement: Cursor and VS Code install with one click from one function
Cursor and VS Code SHALL be one-click installs whose hrefs come from one function taking `{ name, url }`:
`cursor://anysphere.cursor-deeplink/mcp/install?name=<name>&config=<base64 of {"url"}>` for Cursor and
`vscode:mcp/install?<url-encoded {"name","type":"http","url"} json>` for VS Code. The VS Code link SHALL start with
`vscode:mcp/install?`, with no `//` after the scheme, and its json SHALL name the `http` transport beside the server's
name and url.

#### Scenario: The Cursor deeplink includes the server
- **WHEN** the function builds the Cursor link for a name and url
- **THEN** its `name` query is that name and decoding its `config` query yields json holding that url

#### Scenario: The VS Code deeplink includes the server
- **WHEN** the function builds the VS Code link for a name and url
- **THEN** the link starts with `vscode:mcp/install?`, and decoding its query yields json holding that name, that url,
  and `"type": "http"`
