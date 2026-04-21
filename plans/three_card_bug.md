# Remove Recipient Info While Fixing Duplicate Sent Cards

## Summary

- Change only src/App.tsx.
- Keep the existing recipient-side letters model and reply flow unchanged.
- Fix duplicate cards in 내 고민 내역 by grouping sender-side worry docs into one publication card.
- Remove all recipient-related UI and sender-side grouped-view recipient logic from the sent tab.

## Data / State Changes

- Extend Letter with:
    - publicationGroupId?: string
- Preserve raw sender Letter[] semantics.
- Add a separate grouped sent-history projection for the sent tab only.
- Keep the grouped type minimal, with only fields needed after recipient info removal:
    - groupKey: string
    - publicationGroupId?: string
    - originalContent: string
    - categories: string[]
    - createdAt: Timestamp
    - letters: Letter[] only if needed to support grouping assembly; do not add recipient-count or recipient-summary fields

## Implementation Changes

- In publishWorry(...):
    - Generate one local publicationGroupId before Promise.all(...), using a Firestore-style id such as doc(collection(db, 'letters')).id
    - Add that same publicationGroupId to each of the 3 worry docs created by that single publish action
- Do not add publicationGroupId to replies.
- Do not change replyTo: worry.id.
- Keep the raw sender listener query unchanged and derive grouped sent-history data separately for the sent tab.

## Grouping Logic

### New data

- Group by publicationGroupId
- Deterministic key:
    - group:${publicationGroupId}

### Legacy data

- Keep fallback logic in one small local helper inside src/App.tsx
- For docs without publicationGroupId, build a conservative fingerprint from:
    - senderId
    - exact originalContent
    - normalized categories string from (categories ?? [category]).filter(Boolean).sort().join('|')
- Within the same fingerprint, cluster only docs whose createdAt timestamps are within a tight window such as 15 seconds
- Deterministic legacy key:
    - legacy:${fingerprint}:${anchorCreatedAtMillis}
- If createdAt is missing or unusable:
    - keep the doc as a singleton with legacy-single:${doc.id}
- Bias toward false negatives rather than merging unrelated historical worries

## Sent-Tab Rendering

- Update the 내 고민 내역 tab count to use grouped publication count, not raw doc count
- Render one card per grouped publication
- Keep the existing card styling, icon usage, spacing, and hierarchy as intact as possible
- Preserve only:
    - category text
    - quoted original worry content
- Remove the recipient label area entirely from the card header
- Do not replace it with any recipient summary or other recipient-related text
- Rebalance the header minimally so the remaining category text still looks clean

## Validation

- Verify one publish action to 3 recipients still creates 3 raw worry docs sharing the same publicationGroupId
- Verify 내 고민 내역 shows exactly 1 card for that publication
- Verify the sent card shows no recipient-related text
- Verify recipient feed/inbox behavior remains unchanged
- Verify replies still target individual raw worry docs via replyTo: worry.id
- Run npm run build

## Assumptions

- README.md has unrelated local changes and must not be touched
- Raw sender Letter[] semantics should remain preserved, with grouped data introduced only as a separate projection for sent-history rendering
