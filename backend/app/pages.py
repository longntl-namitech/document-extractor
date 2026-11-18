import io
from dataclasses import dataclass
from typing import Literal

import fitz
from PIL import Image

# a text layer with a lower share of printable characters is treated as a scan
MIN_PRINTABLE_RATIO = 0.6
RENDER_DPI = 150


@dataclass
class PageUnit:
    idx: int
    kind: Literal["text", "scan"]
    markdown: str | None
    image_png: bytes | None


def _text(idx: int, markdown: str) -> PageUnit:
    return PageUnit(idx, "text", markdown, None)


def _is_readable(text: str) -> bool:
    chars = [c for c in text if not c.isspace()]
    return bool(chars) and sum(c.isprintable() and c != "\ufffd" for c in chars) / len(chars) >= MIN_PRINTABLE_RATIO


def _pdf_pages(data: bytes) -> list[PageUnit]:
    units = []
    for idx, page in enumerate(fitz.open(stream=data, filetype="pdf")):
        text = page.get_text()
        if _is_readable(text):
            units.append(_text(idx, text))
        else:
            units.append(PageUnit(idx, "scan", None, page.get_pixmap(dpi=RENDER_DPI).tobytes("png")))
    return units


def _image_pages(data: bytes) -> list[PageUnit]:
    buf = io.BytesIO()
    Image.open(io.BytesIO(data)).convert("RGB").save(buf, "PNG")
    return [PageUnit(0, "scan", None, buf.getvalue())]


def _md_row(cells) -> str:
    return "| " + " | ".join("" if c is None else str(c) for c in cells) + " |"


def _xlsx_pages(data: bytes) -> list[PageUnit]:
    import openpyxl

    units = []
    for idx, ws in enumerate(openpyxl.load_workbook(io.BytesIO(data), read_only=True, data_only=True)):
        rows = list(ws.iter_rows(values_only=True))
        lines = [f"## {ws.title}"]
        if rows:
            lines += [_md_row(rows[0]), _md_row(["---"] * len(rows[0]))]
            lines += [_md_row(r) for r in rows[1:]]
        units.append(_text(idx, "\n".join(lines)))
    return units


def _pptx_pages(data: bytes) -> list[PageUnit]:
    import pptx

    return [
        _text(idx, "\n".join(s.text_frame.text for s in slide.shapes if s.has_text_frame))
        for idx, slide in enumerate(pptx.Presentation(io.BytesIO(data)).slides)
    ]


def _docx_pages(data: bytes) -> list[PageUnit]:
    import docx

    # shortcut: paragraphs only, tables are skipped; upgrade when docx tables matter
    sections: list[list[str]] = [[]]
    for p in docx.Document(io.BytesIO(data)).paragraphs:
        if p.style.name == "Heading 1":
            sections.append([f"# {p.text}"])
        else:
            sections[-1].append(p.text)
    if len(sections) > 1 and not any(sections[0]):
        sections.pop(0)
    return [_text(idx, "\n".join(s)) for idx, s in enumerate(sections)]


_EXTRACTORS = {
    "pdf": _pdf_pages,
    "image": _image_pages,
    "xlsx": _xlsx_pages,
    "pptx": _pptx_pages,
    "docx": _docx_pages,
}


def extract_pages(data: bytes, fmt: str) -> list[PageUnit]:
    return _EXTRACTORS[fmt](data)
