# Narrow Worry Routing Update

## Summary

- Remove manual category selection only from the worry publish UI in src/App.tsx.
- Make the worry publish flow use /api/process-worry as the single moderation + category-inference source via src/services/geminiService.ts.
- Keep downstream behavior intact by continuing to store inferred categories, category as the first inferred category, and publicationGroupId, and by leaving reply/comment flows
unchanged except for minimal compatibility guards.

## Exact Files To Change

- src/App.tsx
- src/services/geminiService.ts
- server.ts

## Exact Data Fields Added Or Reused

- Reused on worry documents:
    - categories
    - category
    - publicationGroupId
- Add isAiGenerated: true on the persisted AI reply-side record(s), at the narrowest compatible level that cleanly prevents incorrect human attribution and UI leakage.

## Exact Logic Changes That Are Strictly Necessary

- In WriteForm in src/App.tsx:
    - Remove the worry-only category chip block.
    - Remove worry-only category state and category-count validation.
    - Keep reply writing behavior unchanged.
    - Keep the shared form surface as stable as possible; only make the minimal callback change needed so worry submission no longer depends on category input.
- In publishWorry in src/App.tsx:
    - Stop accepting UI-selected categories.
    - Replace processReply(content) with processWorry(content).
    - If /api/process-worry rejects, stop before creating any letter documents.
    - Use returned inferred categories for all routing and persistence.
    - Keep active-user filtering and self-exclusion as-is unless code inspection proves a direct issue.
    - Select human responders by:
        - computing positive overlap count between inferred categories and each user’s interests
        - grouping users by overlap count
        - iterating groups from highest overlap to lowest positive overlap
        - randomly sampling within each group until 3 humans are chosen or positive-overlap groups are exhausted
    - If fewer than 3 humans are found, fill the remaining slots with persisted AI fallback replies using the narrowest compatible existing path.
    - Persist inferred categories onto each created worry letter, and keep category as the first inferred category for compatibility.
- In the AI fallback / reply persistence path:
    - Ensure persisted AI replies carry an internal AI marker at the narrowest compatible persisted level needed for attribution and UI safety.
    - Remove the inbox-card UI branch that labels replies as AI via senderId.startsWith('bot_').
    - Wherever positive feedback currently increments a sender’s helpedCount, add the minimum guard needed so AI-generated replies never increment any human user’s helpedCount;
    feedback on the reply itself remains unchanged.
    - If fallback AI persistence remains deferred, preserve that behavior and treat brief post-publish “no reply yet” visibility as an expected transient state, not a bug. Only switch
    to synchronous persistence if the current deferred path cannot meet the persistence/marker requirements with a smaller change.
- In src/services/geminiService.ts:
    - Narrow processWorry to the new request/response contract used by the worry publish flow.
    - Do not change processReply or processComment.
- In server.ts:
    - Redefine /api/process-worry to do only:
        - moderation
        - category inference from the fixed existing 20-category vocabulary
    - Return only:
        - { "status": "rejected", "reason": "..." }
        - { "status": "approved", "categories": ["...", "..."] }
    - Add strict normalization/validation:
        - trim and dedupe categories
        - discard labels outside the fixed vocabulary
        - approved results must contain at least 1 valid category
    - If the first model response yields no valid categories after normalization:
        - retry once with a stricter prompt
        - if still invalid or empty, return the rejected shape with a clear reason
    - Never fabricate fallback categories.

## Behavior Intentionally Not Changing

- Reply submission moderation flow stays on /api/process-reply.
- Comment submission moderation flow stays on /api/process-comment.
- Existing worry storage shape remains compatible:
    - categories
    - category
    - publicationGroupId
- Existing feed filtering, inbox rendering, and sent-history grouping should continue to read stored categories the same way.
- No broad schema redesign, no routing architecture rewrite, no taxonomy changes.

## Remaining Risks To Check Before / During Implementation

- senderId compatibility is not assumed safe yet. Before finalizing the AI marker approach, confirm all sender-based branches in src/App.tsx that could still expose or mis-handle
bot_*, especially:
    - inbox/reply labels
    - feedback attribution
    - comment notification targets
    - any sender/profile lookup assumptions
- The current AI fallback path is detached background work. Keep it deferred if that remains the narrowest way to satisfy persistence and internal distinguishability; if it has to
become synchronous, justify that as a minimal compatibility fix rather than a flow redesign.
- The shared WriteForm callback should stay as stable as possible; if TypeScript forces a signature adjustment, limit it to the worry call site and the minimal form typing needed to
compile cleanly.

## Verification

- npm run lint
- npm run build
- Manual code-path verification for:
    - approved worry with 3+ matching humans across descending overlap groups
    - approved worry with 2 humans + AI fallback for the remaining slot
    - approved worry with 0 humans + AI fallback fill
    - rejected worry creates no letter documents
    - inferred categories persist and remain usable by feed/history grouping
    - AI-generated replies are internally marked but not visually labeled as AI