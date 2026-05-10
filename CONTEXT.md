# Worry Publication Baseline

This document captures the current client-side worry publication behavior before moving it behind a use-case boundary.

- Active humans are fetched from Firestore `users` with `lastActive >= oneDayAgo` and query `limit(50)`.
- The only post-query eligibility exclusion is the current author uid.
- No blocked, deleted, bot, or additional status filters are part of the current behavior.
- Humans with at least one overlap between inferred categories and interests are matched candidates.
- Higher overlap groups are selected before lower overlap groups.
- Ties within the same overlap group are shuffled.
- The target recipient count is exactly 3 unique recipients.
- If matched humans are fewer than 3, one unselected AI bot is added with `matchSelectionType: "ai"`.
- If matched humans are 1, up to one overlap-0 human is added as `random_fallback`.
- If matched humans are 0, up to two overlap-0 humans are added as `random_fallback`.
- If matched humans are 2, no random fallback human is added.
- Remaining slots are filled with unselected AI bots as `ai_safety_fallback`.
- Firestore letter fields remain compatible, including both `categories` and legacy `category`.
- `/api/process-worry`, `/api/schedule-bot-reply`, and `/api/notify-new-worry` payload shapes remain unchanged.
