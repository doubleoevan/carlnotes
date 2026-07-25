## MODIFIED Requirements

### Requirement: Resources are embedded through the LiteLLM proxy

Curation SHALL embed a Resource's title and native snippet with the LiteLLM-routed embedding model, storing the vector in `resources.embedding` and, in `resources.embedding_model`, an identifier of the vector space — the underlying model and its dimension — rather than the routing alias. Because the proxy drops the dimension parameter and returns the model's full-width vector, every embedding SHALL pass through one helper that truncates to the schema's dimension (1024) and L2-normalizes the slice; the helper SHALL assert the raw vector is at least that long so a shorter model fails loudly rather than padding. A Resource that already carries an embedding SHALL be reused rather than re-embedded, since embeddings are global to the Resource.

#### Scenario: Embedding and its model are stored

- **WHEN** curation embeds a Resource that has no embedding
- **THEN** the row stores the 1024-dimension vector `embedding` and an `embedding_model` naming the model and dimension that produced it, not the routing alias

#### Scenario: An already-embedded Resource is reused

- **WHEN** curation reaches a Resource that already has an `embedding`
- **THEN** it is not re-embedded and the existing vector is reused

## ADDED Requirements

### Requirement: Curation embeds queries and documents by the model's instruction convention

Curation SHALL embed the topic's effective context as the query side and each Resource as the document side, applying the embedding model's query instruction to the query side only and leaving documents as plain text, per the model's guidance. Both sides SHALL use the same model and dimension so their cosine similarity is meaningful — a vector-space mismatch yields a plausible but wrong similarity with no error — so the two call sites SHALL derive their model from one shared seam. Resource-to-Resource dedupe compares document embeddings and SHALL apply no instruction.

#### Scenario: The query side carries the instruction, the document side does not

- **WHEN** curation embeds the topic context for the relevance gate and a Resource for scoring or dedupe
- **THEN** the topic-context embedding is produced with the model's query instruction and the Resource embedding is produced from plain text

#### Scenario: Both embed sites share one vector space

- **WHEN** the topic context and a Resource are embedded and compared by cosine similarity
- **THEN** both were produced by the same model at the same dimension, so the similarity is valid
