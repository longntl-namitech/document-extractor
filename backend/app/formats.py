import io
import zipfile
from typing import Literal

import fitz

from app.config import Settings

Format = Literal["pdf", "image", "docx", "xlsx", "pptx"]

IMAGE_MAGIC = (b"\x89PNG\r\n\x1a\n", b"\xff\xd8\xff", b"GIF8", b"BM")
OFFICE_PARTS = {"word/document.xml": "docx", "xl/workbook.xml": "xlsx", "ppt/presentation.xml": "pptx"}


class UploadError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


def detect_format(data: bytes) -> Format:
    if data.startswith(b"%PDF-"):
        return "pdf"
    if data.startswith(IMAGE_MAGIC) or (data[:4] == b"RIFF" and data[8:12] == b"WEBP"):
        return "image"
    if data.startswith(b"PK"):
        try:
            names = zipfile.ZipFile(io.BytesIO(data)).namelist()
        except zipfile.BadZipFile:
            raise UploadError("corrupt", "The file is damaged.")
        for part, kind in OFFICE_PARTS.items():
            if part in names:
                return kind
    raise UploadError("unsupported", "Unsupported file type.")


def validate_upload(data: bytes, settings: Settings) -> str:
    if not data:
        raise UploadError("empty", "The file is empty.")
    if len(data) > settings.max_bytes:
        raise UploadError("too_large", "The file is too large.")
    kind = detect_format(data)
    try:
        pages = _count_pages(kind, data)
    except UploadError:
        raise
    except Exception:
        raise UploadError("corrupt", "The file is damaged.")
    if pages > settings.max_pages:
        raise UploadError("too_many_pages", f"The file has more than {settings.max_pages} pages.")
    return kind


def _count_pages(kind: str, data: bytes) -> int:
    if kind == "pdf":
        doc = fitz.open(stream=data, filetype="pdf")
        if doc.needs_pass:
            raise UploadError("encrypted", "Password-protected files are not supported.")
        return doc.page_count
    if kind == "xlsx":
        import openpyxl

        return len(openpyxl.load_workbook(io.BytesIO(data), read_only=True).sheetnames)
    if kind == "pptx":
        import pptx

        return len(pptx.Presentation(io.BytesIO(data)).slides)
    if kind == "docx":
        import docx

        docx.Document(io.BytesIO(data))  # shortcut: no page count for docx, only a parse check
    return 1
