import json
import os
import sys
from math import ceil
from typing import List, Dict, Any, Optional

from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from reportlab.platypus import Table, TableStyle
from reportlab.lib import colors
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont


PAGE_SIZE = A4  # (595.28 x 841.89 points)
MARGIN = 36  # 0.5 inch
FONT_SIZE = 18
DEFAULT_FONT_NAME = "Helvetica"  # Fallback if custom TTF not provided


def maybe_register_ttf(ttf_path: Optional[str]) -> str:
    """Register a TTF font if provided and exists. Returns the font name to use.
    Note: Complex Arabic shaping is not handled by ReportLab by default.
    For best Arabic support, provide a Unicode TTF (e.g., Amiri, DejaVuSans) via --font.
    """
    if ttf_path and os.path.exists(ttf_path):
        try:
            font_name = os.path.splitext(os.path.basename(ttf_path))[0]
            pdfmetrics.registerFont(TTFont(font_name, ttf_path))
            return font_name
        except Exception as e:
            print(f"WARN: Failed to register font '{ttf_path}': {e}. Falling back to {DEFAULT_FONT_NAME}")
    return DEFAULT_FONT_NAME


def load_students(path: str) -> List[Dict[str, Any]]:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def quadrant_bbox(page_w: float, page_h: float, idx: int):
    """Return (x, y, w, h) for quadrant idx 0..3 (TL, TR, BL, BR). Origin at bottom-left."""
    half_w = page_w / 2.0
    half_h = page_h / 2.0
    if idx == 0:  # top-left
        return (0, half_h, half_w, half_h)
    if idx == 1:  # top-right
        return (half_w, half_h, half_w, half_h)
    if idx == 2:  # bottom-left
        return (0, 0, half_w, half_h)
    if idx == 3:  # bottom-right
        return (half_w, 0, half_w, half_h)
    raise ValueError("Quadrant index must be 0..3")


def draw_page_grid(c: canvas.Canvas, page_w: float, page_h: float):
    # Draw vertical and horizontal center lines to split into 4 quadrants
    c.setStrokeColor(colors.lightgrey)
    c.setLineWidth(1)
    c.line(page_w / 2.0, MARGIN, page_w / 2.0, page_h - MARGIN)
    c.line(MARGIN, page_h / 2.0, page_w - MARGIN, page_h / 2.0)


def make_student_table(student: Dict[str, Any], font_name: str) -> Table:
    rows = [
        ["Name", student.get("name", "")],
        ["Phone", student.get("phone_number", "")],
        ["Parent", student.get("parent_phone", "")],
        ["Password", student.get("password", "")],
    ]
    table = Table(rows, hAlign='CENTER')
    table.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (-1, -1), font_name),
        ('FONTSIZE', (0, 0), (-1, -1), FONT_SIZE),
        ('ALIGN', (0, 0), (0, -1), 'RIGHT'),  # labels column alignment
        ('ALIGN', (1, 0), (1, -1), 'LEFT'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('INNERGRID', (0, 0), (-1, -1), 1, colors.black),
        ('BOX', (0, 0), (-1, -1), 1.5, colors.black),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
    ]))
    return table


def draw_table_centered(c: canvas.Canvas, table: Table, box_x: float, box_y: float, box_w: float, box_h: float):
    # Apply an inner margin inside quadrant box to avoid touching edges
    pad = 18
    inner_x = box_x + pad
    inner_y = box_y + pad
    inner_w = max(0, box_w - 2 * pad)
    inner_h = max(0, box_h - 2 * pad)

    # Compute the required size for the table and center it
    w, h = table.wrapOn(c, inner_w, inner_h)
    x = inner_x + (inner_w - w) / 2.0
    y = inner_y + (inner_h - h) / 2.0
    table.drawOn(c, x, y)


def generate_pdf(input_json: str, out_pdf: str, font_ttf: Optional[str] = None, force_pages: int = 6):
    students = load_students(input_json)

    font_name = maybe_register_ttf(font_ttf)

    c = canvas.Canvas(out_pdf, pagesize=PAGE_SIZE)
    page_w, page_h = PAGE_SIZE

    total_slots = max(force_pages * 4, ceil(len(students) / 4) * 4)
    total_pages = total_slots // 4

    idx = 0
    for page in range(total_pages):
        draw_page_grid(c, page_w, page_h)

        for q in range(4):
            slot = page * 4 + q
            student = students[idx] if idx < len(students) else None
            x, y, w, h = quadrant_bbox(page_w, page_h, q)

            if student:
                table = make_student_table(student, font_name)
                draw_table_centered(c, table, x, y, w, h)
                idx += 1

        c.showPage()

    c.save()
    print(f"Saved PDF to: {out_pdf}")


def main():
    import argparse

    parser = argparse.ArgumentParser(description="Generate PDF of student cards (4 per page) from JSON")
    parser.add_argument("input_json", help="Path to students JSON (e.g., *_created.json)")
    parser.add_argument("output_pdf", nargs="?", help="Output PDF path (default: <input_basename>_cards.pdf)")
    parser.add_argument("--font", dest="font", help="Optional path to a Unicode TTF font to embed", default=None)
    parser.add_argument("--pages", dest="pages", type=int, default=6, help="Force total pages (default 6)")

    args = parser.parse_args()

    input_json = args.input_json
    output_pdf = args.output_pdf or os.path.join(
        os.path.dirname(input_json), f"{os.path.splitext(os.path.basename(input_json))[0]}_cards.pdf"
    )

    generate_pdf(input_json, output_pdf, font_ttf=args.font, force_pages=args.pages)


if __name__ == "__main__":
    main()
