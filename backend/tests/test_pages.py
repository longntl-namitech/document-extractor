import io

import fitz
import openpyxl
import pptx

from app.pages import extract_pages
from tests.test_formats import make_pdf, make_png


def scan_pdf(pages: int = 2) -> bytes:
    doc = fitz.open()
    for _ in range(pages):
        page = doc.new_page()
        page.insert_image(page.rect, stream=make_png())
    return doc.tobytes()


def test_text_pdf_pages_are_text_kind():
    units = extract_pages(make_pdf(2), "pdf")
    assert [u.kind for u in units] == ["text", "text"]
    assert "page 0" in units[0].markdown and units[0].image_png is None
    assert [u.idx for u in units] == [0, 1]


def test_scanned_pdf_pages_are_scan_with_image():
    units = extract_pages(scan_pdf(), "pdf")
    assert [u.kind for u in units] == ["scan", "scan"]
    assert all(u.image_png.startswith(b"\x89PNG") and u.markdown is None for u in units)


def test_garbage_text_layer_treated_as_scan(monkeypatch):
    # PyMuPDF cannot write a truly broken text layer, so feed one through get_text
    monkeypatch.setattr(fitz.Page, "get_text", lambda self, *a, **k: "\ufffd" * 20 + "ab")
    units = extract_pages(make_pdf(1), "pdf")
    assert units[0].kind == "scan" and units[0].image_png


def test_xlsx_sheet_becomes_markdown_table():
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.append(["name", "qty"])
    ws.append(["apple", 3])
    buf = io.BytesIO()
    wb.save(buf)
    (unit,) = extract_pages(buf.getvalue(), "xlsx")
    assert unit.kind == "text"
    assert "| name | qty |" in unit.markdown and "| apple | 3 |" in unit.markdown
    assert "| --- | --- |" in unit.markdown


def test_pptx_one_unit_per_slide():
    prs = pptx.Presentation()
    for title in ("first", "second"):
        slide = prs.slides.add_slide(prs.slide_layouts[5])
        slide.shapes.title.text = title
    buf = io.BytesIO()
    prs.save(buf)
    units = extract_pages(buf.getvalue(), "pptx")
    assert len(units) == 2
    assert "first" in units[0].markdown and "second" in units[1].markdown


def test_docx_split_on_heading_1():
    import docx

    d = docx.Document()
    d.add_paragraph("intro")
    d.add_heading("One", 1)
    d.add_paragraph("body one")
    d.add_heading("Two", 1)
    d.add_paragraph("body two")
    buf = io.BytesIO()
    d.save(buf)
    units = extract_pages(buf.getvalue(), "docx")
    assert len(units) == 3
    assert "body one" in units[1].markdown and "# One" in units[1].markdown


def test_image_is_single_scan_unit():
    (unit,) = extract_pages(make_png(), "image")
    assert unit.kind == "scan" and unit.image_png.startswith(b"\x89PNG")
