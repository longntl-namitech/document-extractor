"""Error code the playground UI shows for a failed extraction.

Keyed on the extractor's exception types, never on its Vietnamese message.
Duck-typed so it needs no import of the extractor and can be tested alone.
"""


def error_code(exc: Exception) -> str:
    kind = getattr(exc, "anydoc_error_type", "")
    if kind == "EncryptedError":
        return "encrypted"
    if kind in ("MalformedError", "MissingPartError"):
        return "damaged"
    # every page needs OCR; the extractor raises this when vlm is off or reads nothing
    if type(exc).__name__ == "ScannedPdfError":
        return "scanned"
    return "failed"
