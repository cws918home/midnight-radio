› A previous agent produced the plan below to accomplish the user's task. Implement the plan in a fresh context. Treat the plan as the source of user intent, re-read files as needed, and
carry the work through implementation and verification.

# Inbox Helper Text Semantics Update in `src/App.tsx`

## Summary
`src/App.tsx` 안에서 받은 답장/내가 한 위로 카드의 helper/status 문구 조건만 최소 수정합니다. 데이터 모델 의미는 유지하고, 특히 `given` 탭에서는 기존 helpful 전용 상태 문구를 제거한 뒤
새 3-way 조건만 렌더되도록 합니다.

## Key Changes
- `activeTab === 'received'` 의 `inboxReplies.map(...)` 카드에서:
- `!reply.publisherComment` 이면 `코멘트를 남겨주세요!` 표시
- `reply.publisherComment` 이면 helper/status 문구 미표시
- 기존 `reply.publisherComment && "새로운 코멘트 도착!"` 조건은 제거
- `activeTab === 'given'` 의 `myGivenReplies.map(...)` 카드에서 helper/status 영역을 기존 helpful 표시 대신 아래 3-way 조건으로 완전히 교체:
- `reply.feedback === 'helpful' && !reply.publisherComment` 이면 `따뜻한 한 마디 감사해요!`
- `reply.feedback === 'helpful' && !!reply.publisherComment` 이면 `답장이 왔어요!`
- `reply.feedback === 'not_helpful' || reply.feedback == null` 이면 helper/status 문구 미표시
- `given` 탭에서는 기존 helpful-only 상태 아이콘/문구와 새 helper 문구가 동시에 렌더되지 않도록, helper/status 렌더 조건을 하나의 상호배타적 분기로 정리
- 기존 코멘트 표시 섹션(`답장받은 분의 코멘트:`)은 그대로 유지
- `read_reply`, `read_my_reply` 는 의미 충돌이 있을 때만 최소 조건/문구 조정
- 현재 확인 기준으로는 문맥상 이미 일관적이므로 구조 변경 없이 유지하는 방향

## Public Behavior
- 받은 답장 카드에서 `publisherComment` 는 내가 아직 남기지 않은 코멘트 여부를 안내하는 용도로만 사용
- 내가 한 위로 카드에서 `publisherComment` 는 상대가 남긴 코멘트 도착 여부를 helper/status 로 안내
- `feedback` 이 helpful 이 아닐 때는 `given` 카드에 helper/status 문구가 없음

## Test Plan
- Received:
- `publisherComment` 없음: `코멘트를 남겨주세요!`
- `publisherComment` 있음: helper/status 없음
- `새로운 코멘트 도착!` 미출력
- Given:
- `feedback === 'helpful'`, `publisherComment` 없음: `따뜻한 한 마디 감사해요!`
- `feedback === 'helpful'`, `publisherComment` 있음: `답장이 왔어요!`
- `feedback === 'not_helpful'`: helper/status 없음
- `feedback` null/undefined: helper/status 없음
- 기존 helpful-only 상태 문구와 새 helper 문구가 동시에 보이지 않음
- `publisherComment` 가 있으면 기존 코멘트 본문 섹션은 계속 보임
- Detail views:
- `read_reply` 는 `publisherComment` 를 내가 남긴 코멘트로 유지
- `read_my_reply` 는 `publisherComment` 를 상대가 남긴 코멘트로 유지

## Assumptions
- 새 3-way 조건은 `given` 탭의 기존 helpful helper/status UI를 완전히 대체함
- 현재 기준으로 detail-view text condition 추가 조정은 필요 없음
- 남은 모호성 없음