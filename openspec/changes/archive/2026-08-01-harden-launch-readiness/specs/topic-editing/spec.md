## MODIFIED Requirements

### Requirement: Attachments are managed from the modal and downloadable from the page
The modal SHALL list the Topic's attachments each on its own row with a ✕ remove control, and offer controls to upload a file or add a url; uploads and url ingestion run the real pipeline (size/type validation, object storage, context generation — a url is fetched to markdown first) and removals delete the row plus best-effort the stored object. On the topic page, the info card SHALL offer attachment downloads only to the owner, streaming the stored object with its original filename.

A `ready` attachment's row SHALL also expose its generated context as editable text, since that context steers every later Scan for the Topic. Saving the modal SHALL persist an edited context, and a `pending` or `failed` attachment SHALL show its status instead of an editor, because it has no settled context to edit.

#### Scenario: Upload and removal apply on save
- **WHEN** the owner stages a PDF upload and removes an existing attachment, then saves
- **THEN** the new attachment appears on the page, the removed one is gone, and its object is deleted from storage

#### Scenario: An edited context is saved
- **WHEN** the owner edits a ready attachment's context text and saves the modal
- **THEN** the attachment's stored context is the edited text and the Topic's next Scan uses it

#### Scenario: A pending attachment offers no editor
- **WHEN** the modal lists an attachment still being processed or one that failed
- **THEN** its row shows that status rather than an editable context field
