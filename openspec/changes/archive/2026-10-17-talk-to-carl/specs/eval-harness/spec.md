## MODIFIED Requirements

### Requirement: promptfoo cases test the topic chat reply

The repo SHALL include promptfoo cases for the topic chat, run through `buildTopicChatPrompt` and `toModelMessages` with
the chat's search tool and with web search off, by one package script. Every case SHALL check that the reply links only
to the findings' urls, the docs root, and the docs pages the chat was given, that it has three paragraphs or fewer, that
it credits the findings only with what they say, and that it opens by answering the question. The cases SHALL check that
a question the findings answer is led by those findings by title, that a question they do not cover is marked as Carl's
own knowledge, that a topic with no findings says a scan will fill it, that an instruction inside a finding is never
followed, and that a question about the app is answered from the docs sections the chat was given.

The cases SHALL check that a spoken question gets a short spoken answer: a few sentences with no markdown, lists,
tables, headings, or links, graded as something Carl would say across a table.

#### Scenario: An answer that passes off general knowledge as a finding fails the case

- **GIVEN** a question that no finding covers
- **WHEN** the reply answers it without saying the findings do not cover it
- **THEN** the case fails

#### Scenario: A spoken answer reads like talk
- **WHEN** the spoken case runs
- **THEN** the reply has no markdown, and the rubric passes it as spoken
