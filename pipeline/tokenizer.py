import re

_URL_RE = re.compile(r"https?://\S+")
_HTML_ENTITY_RE = re.compile(r"&[a-zA-Z]+;|&#\d+;")
_NON_ALPHA_RE = re.compile(r"[^a-z0-9\s\-']")
_WHITESPACE_RE = re.compile(r"\s+")
_STRIP_CHARS = "'-"


def tokenize(text: str) -> list[str]:
    text = text.lower()
    text = _URL_RE.sub(" ", text)
    text = _HTML_ENTITY_RE.sub(" ", text)
    text = _NON_ALPHA_RE.sub(" ", text)
    text = _WHITESPACE_RE.sub(" ", text)

    tokens = []
    for token in text.split():
        token = token.strip(_STRIP_CHARS)
        if len(token) >= 2 and not token.isdigit():
            tokens.append(token)
    return tokens
