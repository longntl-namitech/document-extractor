import importlib.util
from pathlib import Path

spec = importlib.util.spec_from_file_location(
    "playground_errors", Path(__file__).parents[2] / "playground" / "errors.py"
)
errors = importlib.util.module_from_spec(spec)
spec.loader.exec_module(errors)


class ScannedPdfError(ValueError):  # same name as the extractor's class
    pass


def anydoc(kind: str, msg: str) -> ValueError:
    exc = ValueError(msg)
    exc.anydoc_error_type = kind
    return exc


def test_scanned_pdf_message_from_extractor_is_scanned():
    msg = "PDF không có chữ nào đọc được (2 trang) — nhiều khả năng là bản scan, cần OCR"
    assert errors.error_code(ScannedPdfError(msg)) == "scanned"


def test_corrupt_file_is_damaged():
    exc = anydoc("MalformedError", "Tài liệu hỏng cấu trúc, không trích xuất được: bad xref")
    assert errors.error_code(exc) == "damaged"
    assert errors.error_code(anydoc("MissingPartError", "x")) == "damaged"


def test_password_protected_is_encrypted():
    assert errors.error_code(anydoc("EncryptedError", "File được bảo vệ bằng mật khẩu: x")) == "encrypted"


def test_anydoc_type_wins_over_scanned_class():
    exc = ScannedPdfError("x")
    exc.anydoc_error_type = "EncryptedError"
    assert errors.error_code(exc) == "encrypted"


def test_unknown_error_is_failed_not_damaged():
    assert errors.error_code(ValueError("vlm=true cần máy chủ cấu hình VLLM_URL")) == "failed"
    assert errors.error_code(anydoc("ConvertError", "x")) == "failed"
    assert errors.error_code(RuntimeError("boom")) == "failed"
