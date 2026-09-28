# Lesson: Session ID Entropy — Don't Use UUID Hex Slice

**Date:** 2026-09-28

## Issue

Initial implementation used `uuid.uuid4().hex[:8]` for session IDs — only 32 bits of entropy. Predictable enough to enumerate in a targeted attack.

## Fix

```python
import secrets
session_id = f"sess-{secrets.token_urlsafe(24)}"
```

`secrets.token_urlsafe(24)` produces 192 bits of entropy. This is the Python standard library's recommended approach for security-sensitive tokens (see OWASP session management guidelines).

## Rule

For any token that gates access to a stateful operation (HITL approval, session resumption), use `secrets.token_urlsafe(n)` where `n >= 16`. Never use UUID hex slices, `random`, or timestamp-based IDs.
