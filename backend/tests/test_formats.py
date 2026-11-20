import io
import zipfile

import fitz
import pytest
from PIL import Image

from app.config import Settings
from app.formats import UploadError, detect_format, validate_upload


def make_pdf(pages: int = 1, password: str | None = None) -> bytes:
    doc = fitz.open()
    for i in range(pages):
        doc.new_page().insert_text((72, 72), f"page {i}")
    if password:
        return doc.tobytes(
            encryption=fitz.PDF_ENCRYPT_AES_256, user_pw=password, owner_pw=password
        )
    return doc.tobytes()


def make_png() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (8, 8), "white").save(buf, "PNG")
    return buf.getvalue()


def make_office(kind: str) -> bytes:
    buf = io.BytesIO()
    if kind == "docx":
        import docx

        docx.Document().save(buf)
    elif kind == "xlsx":
        import openpyxl

        openpyxl.Workbook().save(buf)
    else:
        import pptx

        pptx.Presentation().save(buf)
    return buf.getvalue()


def code_of(data: bytes, settings: Settings | None = None) -> str:
    with pytest.raises(UploadError) as exc:
        validate_upload(data, settings or Settings())
    return exc.value.code


def test_pdf_named_png_detected_as_pdf():
    # detection is by content only, a filename never reaches it
    assert detect_format(make_pdf()) == "pdf"


def test_formats_detected_by_content():
    assert detect_format(make_png()) == "image"
    for kind in ("docx", "xlsx", "pptx"):
        assert detect_format(make_office(kind)) == kind


def test_empty_file_rejected_code_empty():
    assert code_of(b"") == "empty"


def test_encrypted_pdf_code_encrypted():
    assert code_of(make_pdf(password="secret")) == "encrypted"


def test_corrupt_pdf_code_corrupt():
    assert code_of(b"%PDF-1.4\nnot really a pdf") == "corrupt"


def test_exactly_10_pages_accepted():
    assert validate_upload(make_pdf(10), Settings()) == "pdf"


def test_11_pages_rejected_too_many_pages():
    assert code_of(make_pdf(11)) == "too_many_pages"


def test_over_10mb_rejected_too_large():
    assert code_of(b"\0" * 10_000_001) == "too_large"


def test_zip_with_unknown_content_unsupported():
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("hello.txt", "hi")
    assert code_of(buf.getvalue()) == "unsupported"


@pytest.mark.parametrize("kind", ["docx", "xlsx", "pptx"])
def test_office_files_accepted(kind):
    assert validate_upload(make_office(kind), Settings()) == kind
