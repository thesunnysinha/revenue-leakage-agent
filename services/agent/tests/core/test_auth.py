from app.core.auth import token_matches


def test_backend_auth_rejects_missing_or_empty_credentials() -> None:
    assert not token_matches(None, "a" * 40)
    assert not token_matches("", "a" * 40)
    assert not token_matches("a" * 40, None)


def test_backend_auth_accepts_only_exact_token_match() -> None:
    expected = "shared-service-token-with-sufficient-length"
    assert token_matches(expected, expected)
    assert not token_matches(expected + "x", expected)
