## MODIFIED Requirements

### Requirement: Shared files belong to the room

A member MAY attach one file to a message — an image, a PDF, text, or a video. The file belongs to the room: every member can download it, Carl reads it and may quote it for everyone, and each member may hold at most twenty shared files per room. A video SHALL play in place in the message bubble above its name row, served inline under a video allowlist exactly as strict as the image one and honoring byte ranges, while every other stored kind stays a download; Carl SHALL read a fixed line saying the video cannot be watched, stored ready at post time so no description job runs or fails for it. The room post body SHALL be bounded at the same limit as a private chat turn's. Deletion belongs to the uploader and to any leader of the Team; deleting removes the file from Carl's future turns while his past answers stand. Downloads and deletion SHALL be gated by room membership at the API, never by the Topic's visibility. A member's privately kept chat material SHALL never enter a room turn, since the answer posts to everyone.

#### Scenario: A shared file reaches everyone and only them

- **WHEN** a member shares a file with a message
- **THEN** every member can download it and Carl can cite it, a non-member's download answers 404, and a plain member who neither uploaded it nor leads the Team cannot delete it

#### Scenario: A shared clip plays in the bubble and stays deletable

- **WHEN** a member shares an mp4 with a message
- **THEN** the bubble plays it in place from the membership-gated url, its name row still downloads it, the uploader or a leader can delete it, and after deletion the url answers 404

#### Scenario: Carl reads a line instead of watching

- **WHEN** a room turn runs while a shared video is in the room
- **THEN** the attachments block lists the file by name and uploader with a fixed line saying it cannot be watched, and its row never reaches a failed status for lacking a description
