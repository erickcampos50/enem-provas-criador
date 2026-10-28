#!/usr/bin/env python3
"""Extract ENEM questions + images from official INEP PDFs into enem.dev-shaped JSON.

Canonical book: Azul (D1 CD1 + D2 CD7). Language variants come from the
"opção inglês" / "opção espanhol" blocks on day 1.

Output per year (default under .cache/enem-extract/<year>/):
  exam.json          — exam summary (enem.dev shape)
  questions.json     — list of question details (enem.dev shape)
  media/...          — extracted image files (same names as asset:media/... keys)
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import unicodedata
from pathlib import Path

try:
    import pymupdf
except ImportError:  # pragma: no cover
    import fitz as pymupdf  # type: ignore


QUESTION_RE = re.compile(r"^QUEST[AÃ]O\s+(\d{1,3})\s*$", re.IGNORECASE)
SECTION_EN = re.compile(r"op[cç][aã]o\s+ingl[êe]s", re.IGNORECASE)
SECTION_ES = re.compile(r"op[cç][aã]o\s+espanhol", re.IGNORECASE)
SECTION_06_45 = re.compile(r"Quest[oõ]es de 06 a 45", re.IGNORECASE)
SECTION_46_90 = re.compile(r"Quest[oõ]es de 46 a 90", re.IGNORECASE)
SECTION_91_135 = re.compile(r"Quest[oõ]es de 91 a 135", re.IGNORECASE)
SECTION_136_180 = re.compile(r"Quest[oõ]es de 136 a 180", re.IGNORECASE)
SECTION_GENERIC = re.compile(r"Texto para as Quest[oõ]es de (\d+) a (\d+)", re.IGNORECASE)
NON_QUESTION_PAGE = re.compile(
    r"PROPOSTA DE REDA[ÇC][ÃA]O|FOLHA DE RESPOSTAS", re.IGNORECASE
)

ALT_RE = re.compile(r"^([A-E])(?:\s+(.*\S))?\s*$")
NOISE_RE = re.compile(
    r"^(ENEM20\d{2}|[*]\d{4,}[A-Z0-9]*[*]?|RASCUNHO|DA REDAÇÃO|"
    r"Transcreva a sua Redação|LEIA ATENTAMENTE|CADERNO|Gabarito)",
    re.IGNORECASE,
)

DISCIPLINE_BY_RANGE = [
    (1, 45, "linguagens"),
    (46, 90, "ciencias-humanas"),
    (91, 135, "ciencias-natureza"),
    (136, 180, "matematica"),
]


def discipline_for(index: int) -> str | None:
    for low, high, name in DISCIPLINE_BY_RANGE:
        if low <= index <= high:
            return name
    return None


def clean_line(line: str) -> str:
    return re.sub(r"\s+", " ", line).strip()


def parse_gabarito(path: Path) -> dict[int, dict[str, str | None]]:
    """Return {question_number: {"ingles": "C"|None, "espanhol": "D"|None, "default": "B"|None}}."""
    doc = pymupdf.open(path)
    text = "\n".join(page.get_text("text") for page in doc)
    doc.close()
    result: dict[int, dict[str, str | None]] = {}
    # Dual language block: "1 C C" / "2 A D"
    for match in re.finditer(r"(?m)^(\d{1,3})\s+([A-E]|Anulado)\s+([A-E]|Anulado)\s*$", text):
        number = int(match.group(1))
        result.setdefault(number, {"ingles": None, "espanhol": None, "default": None})
        result[number]["ingles"] = None if match.group(2).lower() == "anulado" else match.group(2)
        result[number]["espanhol"] = None if match.group(3).lower() == "anulado" else match.group(3)
        result[number]["default"] = result[number]["ingles"] or result[number]["espanhol"]
        if match.group(2).lower() == "anulado" and match.group(3).lower() == "anulado":
            result[number]["default"] = None
            result[number]["voided"] = True  # type: ignore[assignment]
    # Single letter rows (most questions)
    for match in re.finditer(r"(?m)^(\d{1,3})\s+([A-E]|Anulado)\s*$", text):
        number = int(match.group(1))
        entry = result.setdefault(number, {"ingles": None, "espanhol": None, "default": None})
        letter = match.group(2)
        if letter.lower() == "anulado":
            entry["default"] = None
            entry["voided"] = True  # type: ignore[assignment]
        elif entry.get("default") is None:
            entry["default"] = letter
    return result


def split_pages(doc) -> list[str]:
    return [page.get_text("text") for page in doc]


def split_stem_and_alternatives(body_lines: list[str]) -> tuple[list[str], dict[str, str]]:
    """Separate the question stem from its A-E alternatives.

    A stem line may start with "A " (e.g. "A cúpula pentagonal..."), so a
    letter-prefixed line is only accepted as option A when B, C, D and E
    follow it in order. Without that sequence, fall back to the first
    letter-prefixed line to preserve the previous behavior for visual
    alternatives.
    """
    run_start: int | None = None
    expected: str | None = None
    for index, line in enumerate(body_lines):
        match = ALT_RE.match(line)
        if not match:
            continue
        letter = match.group(1)
        if letter == "A":
            run_start = index
            expected = "B"
        elif run_start is not None and letter == expected:
            if expected == "E":
                break
            expected = "BCDE"["BCDE".index(expected) + 1]
    else:
        run_start = None

    if run_start is None:
        run_start = next(
            (index for index, line in enumerate(body_lines) if ALT_RE.match(line)),
            len(body_lines),
        )

    stem_lines = body_lines[:run_start]
    alternatives: dict[str, str] = {}
    current_alt: str | None = None
    for line in body_lines[run_start:]:
        match = ALT_RE.match(line)
        if match:
            current_alt = match.group(1)
            alternatives[current_alt] = (match.group(2) or "").strip()
        elif current_alt:
            alternatives[current_alt] = f"{alternatives[current_alt]} {line}".strip()
    return stem_lines, alternatives


def parse_questions_from_pages(pages: list[str], year: int) -> list[dict]:
    """Parse raw question blocks with language tags."""
    blocks: list[dict] = []
    current_language: str | None = None
    current_discipline_hint: str | None = None

    for page_text in pages:
        lines = page_text.splitlines()
        i = 0
        while i < len(lines):
            raw = lines[i]
            line = clean_line(raw)
            if not line or NOISE_RE.match(line):
                i += 1
                continue

            if SECTION_EN.search(line):
                current_language = "ingles"
                current_discipline_hint = "linguagens"
                i += 1
                continue
            if SECTION_ES.search(line):
                current_language = "espanhol"
                current_discipline_hint = "linguagens"
                i += 1
                continue
            if SECTION_06_45.search(line) or SECTION_GENERIC.search(line):
                current_language = None
                current_discipline_hint = "linguagens"
                i += 1
                continue
            if SECTION_46_90.search(line):
                current_language = None
                current_discipline_hint = "ciencias-humanas"
                i += 1
                continue
            if SECTION_91_135.search(line):
                current_language = None
                current_discipline_hint = "ciencias-natureza"
                i += 1
                continue
            if SECTION_136_180.search(line):
                current_language = None
                current_discipline_hint = "matematica"
                i += 1
                continue

            match = QUESTION_RE.match(line)
            if match:
                number = int(match.group(1))
                if number > 5:
                    current_language = None
                body_lines: list[str] = []
                i += 1
                while i < len(lines):
                    next_line = clean_line(lines[i])
                    if QUESTION_RE.match(next_line) or SECTION_EN.search(next_line) or SECTION_ES.search(next_line):
                        break
                    if SECTION_06_45.search(next_line) or SECTION_46_90.search(next_line):
                        break
                    if SECTION_91_135.search(next_line) or SECTION_136_180.search(next_line):
                        break
                    if next_line and not NOISE_RE.match(next_line):
                        body_lines.append(next_line)
                    i += 1

                stem_lines, alternatives = split_stem_and_alternatives(body_lines)

                blocks.append(
                    {
                        "year": year,
                        "index": number,
                        "language": current_language,
                        "discipline": discipline_for(number) or current_discipline_hint,
                        "stem_lines": stem_lines,
                        "alternatives": alternatives,
                    }
                )
                continue

            i += 1

    return blocks


def split_context_and_intro(stem_lines: list[str]) -> tuple[str | None, str | None]:
    """Last stem paragraph is usually the prompt (enunciado); earlier lines are context."""
    if not stem_lines:
        return None, None
    if len(stem_lines) == 1:
        return None, stem_lines[0]
    # Heuristic: citation-ish tail ("Disponível em", "KEYS,", "adaptado") stays in context.
    intro = stem_lines[-1]
    # If last line is a short question/prompt, peel it.
    if len(intro) < 400 and not re.search(r"Disponível em|Acesso em|adaptado\.?$", intro, re.I):
        context = "\n".join(stem_lines[:-1])
        return context or None, intro
    return "\n".join(stem_lines), None


def build_question_payload(block: dict, gabarito: dict, media_keys: list[str]) -> dict | None:
    number = block["index"]
    language = block["language"]
    gab = gabarito.get(number, {})
    voided = bool(gab.get("voided"))
    if language == "ingles":
        correct = gab.get("ingles")
    elif language == "espanhol":
        correct = gab.get("espanhol")
    else:
        correct = gab.get("default")

    alts = block["alternatives"]
    # Normalize to A-E even if a letter is missing in the PDF text layer.
    alternatives = []
    for letter in "ABCDE":
        text = alts.get(letter)
        if text is None:
            text = ""
        alternatives.append(
            {
                "letter": letter,
                "text": text or None,
                "file": None,
                "isCorrect": bool(correct) and letter == correct,
            }
        )

    context, intro = split_context_and_intro(block["stem_lines"])
    files = list(media_keys)
    title_suffix = " (Anulado)" if voided else ""

    return {
        "title": f"Questão {number} - ENEM {block['year']}{title_suffix}",
        "index": number,
        "year": block["year"],
        "language": language,
        "discipline": block["discipline"],
        "context": context,
        "files": files,
        # Voided items have no valid answer; keep schema NOT NULL but avoid lying "A".
        "correctAlternative": correct or ("" if voided else "A"),
        "alternativesIntroduction": intro,
        "alternatives": alternatives,
        "voided": voided,
    }


def is_question_image(page, info: dict) -> bool:
    bbox = info.get("bbox") or (0, 0, 0, 0)
    x0, y0, x1, y1 = bbox
    width = float(x1 - x0)
    height = float(y1 - y0)
    if width < 30 or height < 30:
        return False
    # Skip full-page decorative backgrounds / watermarks
    if width > page.rect.width * 0.95 and height > page.rect.height * 0.5:
        return False
    return bool(info.get("xref"))


def collect_question_images(doc1, doc2) -> dict[tuple[int, str | None], list[dict]]:
    """Assign every printed image to the question block that owns it.

    The booklet flows down the left column and then down the right column, so
    an image belongs to the last question heading before it in that reading
    order. Cover, essay ("proposta de redação") and answer-sheet pages carry
    no question images and are skipped.
    """
    events: list[dict] = []
    for doc_tag, doc in (("d1", doc1), ("d2", doc2)):
        for page_no in range(doc.page_count):
            if page_no == 0:
                continue
            page = doc[page_no]
            if NON_QUESTION_PAGE.search(page.get_text("text")):
                continue
            mid = page.rect.width / 2.0
            for block in page.get_text("blocks"):
                x0, y0, x1, y1, text, *_ = block
                for line in text.splitlines():
                    clean = clean_line(line)
                    if not clean:
                        continue
                    kind = None
                    number = None
                    if SECTION_EN.search(clean):
                        kind = "ingles"
                    elif SECTION_ES.search(clean):
                        kind = "espanhol"
                    elif (
                        SECTION_06_45.search(clean)
                        or SECTION_46_90.search(clean)
                        or SECTION_91_135.search(clean)
                        or SECTION_136_180.search(clean)
                        or SECTION_GENERIC.search(clean)
                    ):
                        kind = "none"
                    else:
                        match = QUESTION_RE.match(clean)
                        if match:
                            kind = "question"
                            number = int(match.group(1))
                    if kind is None:
                        continue
                    events.append(
                        dict(
                            kind=kind,
                            number=number,
                            doc=doc_tag,
                            page=page_no,
                            col=0 if x0 < mid else 1,
                            y=y0,
                        )
                    )
            for image_index, info in enumerate(page.get_image_info(xrefs=True)):
                if not is_question_image(page, info):
                    continue
                bbox = info["bbox"]
                events.append(
                    dict(
                        kind="image",
                        doc=doc_tag,
                        page=page_no,
                        col=0 if bbox[0] < mid else 1,
                        y=(bbox[1] + bbox[3]) / 2.0,
                        image=dict(
                            doc=doc_tag,
                            page=page_no,
                            index=image_index,
                            xref=info["xref"],
                        ),
                    )
                )

    events.sort(
        key=lambda event: (
            0 if event["doc"] == "d1" else 1,
            event["page"],
            event["col"],
            event["y"],
            1 if event["kind"] == "image" else 0,
        )
    )

    images: dict[tuple[int, str | None], list[dict]] = {}
    language: str | None = None
    owner: tuple[int, str | None] | None = None
    for event in events:
        if event["kind"] in ("ingles", "espanhol"):
            language = event["kind"]
        elif event["kind"] == "none":
            language = None
        elif event["kind"] == "question":
            number = event["number"]
            if number > 5:
                language = None
            owner = (number, language)
        elif owner is not None:
            images.setdefault(owner, []).append(event["image"])
    return images


def read_image_bytes(doc, xref: int) -> tuple[bytes, str]:
    extracted = doc.extract_image(xref)
    if not extracted or not extracted.get("image"):
        return b"", ""
    ext = (extracted.get("ext") or "png").lower()
    if ext == "jpeg":
        ext = "jpg"
    # Browsers do not decode JPEG 2000; convert those images to PNG.
    if ext in {"jpx", "jp2", "j2k"}:
        pix = pymupdf.Pixmap(doc, xref)
        if pix.alpha:
            pix = pymupdf.Pixmap(pix, 0)
        if pix.n < 3:
            pix = pymupdf.Pixmap(pymupdf.csRGB, pix)
        return pix.tobytes("png"), "png"
    return extracted["image"], ext


def extract_question_images(
    doc1,
    doc2,
    refs: list[dict],
    dest_dir: Path,
    year: int,
    number: int,
    language: str | None,
) -> list[str]:
    """Extract the given image references into the question's media folder."""
    folder = f"{number}" if not language else f"{number}-{language}"
    keys: list[str] = []
    for ref in refs:
        doc = doc1 if ref["doc"] == "d1" else doc2
        try:
            image_bytes, ext = read_image_bytes(doc, ref["xref"])
        except Exception:
            continue
        if not image_bytes:
            continue
        name = f"img-{ref['page'] + 1}-{ref['index']}.{ext}"
        rel = f"{year}/questions/{folder}/{name}"
        out = dest_dir / rel
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_bytes(image_bytes)
        key = f"asset:media/{rel}"
        if key not in keys:
            keys.append(key)
    return keys


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--year", type=int, required=True)
    parser.add_argument("--day1", type=Path, required=True, help="PV D1 CD1 (Azul)")
    parser.add_argument("--day2", type=Path, required=True, help="PV D2 CD7 (Azul)")
    parser.add_argument("--gabarito1", type=Path, required=True)
    parser.add_argument("--gabarito2", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()

    args.out.mkdir(parents=True, exist_ok=True)
    # Images keep their asset path: <out>/<year>/questions/<n>/img-*.
    media_root = args.out

    gabarito = parse_gabarito(args.gabarito1)
    gabarito.update(parse_gabarito(args.gabarito2))

    doc1 = pymupdf.open(args.day1)
    doc2 = pymupdf.open(args.day2)
    pages = split_pages(doc1) + split_pages(doc2)
    blocks = parse_questions_from_pages(pages, args.year)

    question_images = collect_question_images(doc1, doc2)

    questions = []
    exam_questions = []
    for block in blocks:
        key = (block["index"], block["language"])
        media_keys = extract_question_images(
            doc1,
            doc2,
            question_images.get(key, []),
            media_root,
            args.year,
            block["index"],
            block["language"],
        )

        payload = build_question_payload(block, gabarito, media_keys)
        if payload:
            questions.append(payload)
            exam_questions.append(
                {
                    "title": payload["title"],
                    "index": payload["index"],
                    "discipline": payload["discipline"],
                    "language": payload["language"],
                }
            )

    # Stable exam order: 1..180 with language null/ingles/espanhol grouping like enem.dev
    def sort_key(item: dict):
        lang_order = {None: 0, "ingles": 1, "espanhol": 2}
        return (item["index"], lang_order.get(item.get("language"), 9))

    questions.sort(key=sort_key)
    exam_questions.sort(key=lambda item: (item["index"], {None: 0, "ingles": 1, "espanhol": 2}.get(item.get("language"), 9)))

    exam = {
        "title": f"ENEM {args.year}",
        "year": args.year,
        "disciplines": [
            {"label": "Ciências Humanas e suas Tecnologias", "value": "ciencias-humanas"},
            {"label": "Ciências da Natureza e suas Tecnologias", "value": "ciencias-natureza"},
            {"label": "Linguagens, Códigos e suas Tecnologias", "value": "linguagens"},
            {"label": "Matemática e suas Tecnologias", "value": "matematica"},
        ],
        "languages": [
            {"label": "Espanhol", "value": "espanhol"},
            {"label": "Inglês", "value": "ingles"},
        ],
        "questions": exam_questions,
    }

    (args.out / "exam.json").write_text(json.dumps(exam, ensure_ascii=False, indent=2), encoding="utf-8")
    (args.out / "questions.json").write_text(json.dumps(questions, ensure_ascii=False, indent=2), encoding="utf-8")

    with_images = sum(1 for q in questions if q["files"])
    voided = sum(1 for q in questions if q.get("voided"))
    print(
        f"year={args.year} questions={len(questions)} with_images={with_images} voided={voided} "
        f"gabarito_entries={len(gabarito)} out={args.out}",
        file=sys.stderr,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
