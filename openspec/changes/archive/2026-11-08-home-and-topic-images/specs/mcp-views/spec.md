# Spec Delta

## ADDED Requirements

### Requirement: The findings view and the search view show the Topic's image

The findings MCP view's header SHALL show the Topic's `list` image beside its name, and the search MCP view's Topic
rows SHALL show the image, both through the shared image component.

#### Scenario: A findings view shows its Topic

- **WHEN** a client opens a Topic's findings view
- **THEN** the header shows the Topic's `list` image beside its name

#### Scenario: A search row shows its image

- **WHEN** a search MCP view lists a Topic with an image
- **THEN** the row shows the image at its left
