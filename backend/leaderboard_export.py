"""
Leaderboard export for the admin panel: PDF and DOCX files built with the standard library only
(no extra dependencies to install on the server or on Vercel).
"""
import io
import zipfile
from datetime import datetime
from xml.sax.saxutils import escape

TITLE = "PYLOOM Participant Leaderboard"
HEADERS = ["Rank", "Player ID / Team code", "Player / Team name", "College", "Year of study", "Score"]


def leaderboard_rows(leaderboard):
    """One list of display strings per participant, in rank order."""
    rows = []
    for row in leaderboard:
        name = str(row.get("player_name") or "—")
        members = row.get("members") or []
        if row.get("mode") == "team" and members:
            name = f"{name} (members: {', '.join(str(m) for m in members)})"
        rows.append([
            str(row.get("rank", "")),
            str(row.get("player_id") or "—"),
            name,
            str(row.get("college") or "—"),
            str(row.get("year_of_study") or "—"),
            f"{row.get('score', 0)} / {row.get('max_score', 100)}",
        ])
    return rows


def _generated_label():
    return "Generated " + datetime.now().strftime("%d %b %Y, %H:%M")


# ---------------------------------------------------------------------------
# DOCX: a minimal WordprocessingML package with one landscape table.
# ---------------------------------------------------------------------------
def _docx_cell(text, width, bold=False, shade=None, align="left"):
    shading = f'<w:shd w:val="clear" w:color="auto" w:fill="{shade}"/>' if shade else ""
    run_props = "<w:rPr><w:b/></w:rPr>" if bold else ""
    return (
        f'<w:tc><w:tcPr><w:tcW w:w="{width}" w:type="dxa"/>{shading}</w:tcPr>'
        f'<w:p><w:pPr><w:spacing w:before="40" w:after="40"/><w:jc w:val="{align}"/></w:pPr>'
        f'<w:r>{run_props}<w:t xml:space="preserve">{escape(text)}</w:t></w:r></w:p></w:tc>'
    )


def build_docx(leaderboard):
    widths = [800, 2200, 3600, 3200, 1600, 1400]  # twentieths of a point, ~12800 = landscape A4 body
    aligns = ["center", "left", "left", "left", "left", "right"]
    podium = {"1": "FFF4C2", "2": "ECECEC", "3": "F6DDC8"}
    rows_xml = ["<w:tr><w:trPr><w:tblHeader/></w:trPr>" + "".join(
        _docx_cell(h, w, bold=True, shade="D9E2F3", align=a) for h, w, a in zip(HEADERS, widths, aligns)
    ) + "</w:tr>"]
    for cells in leaderboard_rows(leaderboard):
        shade = podium.get(cells[0])
        rows_xml.append("<w:tr>" + "".join(
            _docx_cell(c, w, bold=(i == 0), shade=shade, align=a) for i, (c, w, a) in enumerate(zip(cells, widths, aligns))
        ) + "</w:tr>")
    if len(rows_xml) == 1:
        rows_xml.append("<w:tr>" + _docx_cell("No participants yet.", sum(widths)).replace(
            "<w:tcPr>", f'<w:tcPr><w:gridSpan w:val="{len(widths)}"/>', 1) + "</w:tr>")

    border = '<w:{0} w:val="single" w:sz="4" w:space="0" w:color="A6A6A6"/>'
    borders = "".join(border.format(side) for side in ("top", "left", "bottom", "right", "insideH", "insideV"))
    table = (
        '<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/>'
        f"<w:tblBorders>{borders}</w:tblBorders>"
        '<w:tblCellMar><w:left w:w="80" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar>'
        "</w:tblPr><w:tblGrid>" + "".join(f'<w:gridCol w:w="{w}"/>' for w in widths) + "</w:tblGrid>"
        + "".join(rows_xml) + "</w:tbl>"
    )
    document = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'
        f'<w:p><w:pPr><w:spacing w:after="80"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="36"/></w:rPr><w:t>{escape(TITLE)}</w:t></w:r></w:p>'
        f'<w:p><w:pPr><w:spacing w:after="200"/></w:pPr><w:r><w:rPr><w:color w:val="666666"/><w:sz w:val="20"/></w:rPr>'
        f"<w:t>{escape(_generated_label())} · {len(leaderboard)} participant(s)</w:t></w:r></w:p>"
        + table +
        '<w:p/><w:sectPr><w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/>'
        '<w:pgMar w:top="1000" w:right="1000" w:bottom="1000" w:left="1000" w:header="500" w:footer="500" w:gutter="0"/>'
        "</w:sectPr></w:body></w:document>"
    )
    content_types = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        '<Default Extension="xml" ContentType="application/xml"/>'
        '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
        "</Types>"
    )
    rels = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
        "</Relationships>"
    )
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as package:
        package.writestr("[Content_Types].xml", content_types)
        package.writestr("_rels/.rels", rels)
        package.writestr("word/document.xml", document)
    return buffer.getvalue()


# ---------------------------------------------------------------------------
# PDF: landscape A4 pages drawn with the built-in Helvetica fonts; long cells wrap.
# ---------------------------------------------------------------------------
PAGE_W, PAGE_H, MARGIN = 842, 595, 36
FONT_SIZE, LINE_H, PAD = 9, 12, 4
COL_W = [40, 120, 230, 220, 90, 70]  # sums to PAGE_W - 2 * MARGIN


def _text_width(text, size=FONT_SIZE, bold=False):
    # Close enough to Helvetica metrics for wrapping: narrow, regular and wide glyph classes.
    narrow, wide = set("ijlI.,:;'|!()[] ft"), set("mwMW@%")
    units = sum(278 if ch in narrow else 833 if ch in wide else 556 for ch in text)
    return units * size / 1000 * (1.06 if bold else 1)


def _wrap(text, width, bold=False):
    lines, line = [], ""
    for word in text.split(" "):
        candidate = f"{line} {word}".strip()
        if _text_width(candidate, bold=bold) <= width or not line:
            line = candidate
        else:
            lines.append(line)
            line = word
        while _text_width(line, bold=bold) > width and len(line) > 1:  # a single over-long word
            cut = len(line)
            while cut > 1 and _text_width(line[:cut], bold=bold) > width:
                cut -= 1
            lines.append(line[:cut])
            line = line[cut:]
    lines.append(line)
    return lines


def _pdf_str(text):
    data = text.replace("—", "-").replace("·", "-").encode("cp1252", "replace")
    return "(" + data.decode("latin-1").replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)") + ")"


def build_pdf(leaderboard):
    rows = leaderboard_rows(leaderboard)
    podium = {"1": "1 0.957 0.761", "2": "0.925 0.925 0.925", "3": "0.965 0.867 0.784"}
    pages, ops = [], []

    def text(x, y, value, bold=False, size=FONT_SIZE, gray=0):
        ops.append(f"BT /{'F2' if bold else 'F1'} {size} Tf {gray} g {x:.1f} {y:.1f} Td {_pdf_str(value)} Tj ET")

    def draw_row(cells, y, bold=False, fill=None):
        wrapped = [_wrap(c, w - 2 * PAD, bold) for c, w in zip(cells, COL_W)]
        height = max(len(w) for w in wrapped) * LINE_H + 2 * PAD
        if fill:
            ops.append(f"{fill} rg {MARGIN} {y - height:.1f} {sum(COL_W)} {height:.1f} re f")
        x = MARGIN
        for lines, w in zip(wrapped, COL_W):
            for i, line in enumerate(lines):
                text(x + PAD, y - PAD - (i + 1) * LINE_H + 3, line, bold)
            ops.append(f"0.65 G 0.5 w {x:.1f} {y - height:.1f} {w} {height:.1f} re S")
            x += w
        return y - height

    def row_height(cells, bold=False):
        return max(len(_wrap(c, w - 2 * PAD, bold)) for c, w in zip(cells, COL_W)) * LINE_H + 2 * PAD

    def new_page():
        ops.clear()
        y = PAGE_H - MARGIN
        if not pages:
            text(MARGIN, y - 18, TITLE, bold=True, size=18)
            text(MARGIN, y - 34, f"{_generated_label()} - {len(rows)} participant(s)", size=9, gray=0.4)
            y -= 48
        return draw_row(HEADERS, y, bold=True, fill="0.851 0.886 0.953")

    def finish_page():
        text(PAGE_W - MARGIN - 50, MARGIN - 16, f"Page {len(pages) + 1}", size=8, gray=0.4)
        pages.append("\n".join(ops))

    y = new_page()
    if not rows:
        text(MARGIN + PAD, y - 16, "No participants yet.")
    for cells in rows:
        if y - row_height(cells) < MARGIN:
            finish_page()
            y = new_page()
        y = draw_row(cells, y, bold=False, fill=podium.get(cells[0]))
    finish_page()

    # Objects: 1 catalog, 2 pages, 3-4 fonts, then (page, content) pairs.
    objects = [
        "<< /Type /Catalog /Pages 2 0 R >>",
        None,
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
    ]
    kids = []
    for content in pages:
        page_no, content_no = len(objects) + 1, len(objects) + 2
        kids.append(f"{page_no} 0 R")
        objects.append(
            f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {PAGE_W} {PAGE_H}] "
            f"/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents {content_no} 0 R >>"
        )
        stream = content.encode("latin-1")
        objects.append((f"<< /Length {len(stream)} >>\nstream\n".encode("latin-1") + stream + b"\nendstream"))
    objects[1] = f"<< /Type /Pages /Kids [{' '.join(kids)}] /Count {len(kids)} >>"

    out = io.BytesIO()
    out.write(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    offsets = []
    for number, body in enumerate(objects, start=1):
        offsets.append(out.tell())
        out.write(f"{number} 0 obj\n".encode("latin-1"))
        out.write(body if isinstance(body, bytes) else body.encode("latin-1"))
        out.write(b"\nendobj\n")
    xref = out.tell()
    out.write(f"xref\n0 {len(objects) + 1}\n0000000000 65535 f \n".encode("latin-1"))
    for offset in offsets:
        out.write(f"{offset:010d} 00000 n \n".encode("latin-1"))
    out.write(f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode("latin-1"))
    return out.getvalue()
