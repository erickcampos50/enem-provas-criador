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

ALT_RE = re.compile(r"^([A-E])\s+(.*\S)\s*$")
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

                stem_lines: list[str] = []
                alternatives: dict[str, str] = {}
                current_alt: str | None = None
                for body in body_lines:
                    alt_match = ALT_RE.match(body)
                    # Alternative letters are alone on a line in these PDFs sometimes:
                    # "A\tdar oportunidade..." already joined as "A dar..."
                    if alt_match and alt_match.group(1) in "ABCDE":
                        # Heuristic: alternatives start after we have some stem,
                        # or letter is at start and looks like option text.
                        letter = alt_match.group(1)
                        text = alt_match.group(2)
                        if current_alt is None and not stem_lines and len(text) < 3:
                            stem_lines.append(body)
                            continue
                        current_alt = letter
                        alternatives[letter] = text
                        continue
                    # Standalone letter line (layout variant)
                    if re.fullmatch(r"[A-E]", body) and stem_lines:
                        current_alt = body
                        alternatives.setdefault(body, "")
                        continue
                    if current_alt:
                        alternatives[current_alt] = f"{alternatives[current_alt]} {body}".strip()
                    else:
                        stem_lines.append(body)

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


def _bbox_range_overlap(a0: float, a1: float, b0: float, b1: float) -> float:
    return max(0.0, min(a1, b1) - max(a0, b0))


def extract_images_for_pages(
    doc,
    page_numbers: list[int],
    dest_dir: Path,
    year: int,
    index: int,
    language: str | None,
    y_ranges: list[tuple[float, float]] | None = None,
) -> list[str]:
    """Extract images, optionally only those whose y-range overlaps question text."""
    dest_dir.mkdir(parents=True, exist_ok=True)
    keys: list[str] = []
    folder = f"{index}" if not language else f"{index}-{language}"
    for page_no in page_numbers:
        page = doc[page_no]
        image_infos = page.get_image_info(xrefs=True)
        for image_index, info in enumerate(image_infos):
            bbox = info.get("bbox") or (0, 0, 0, 0)
            x0, y0, x1, y1 = bbox
            width = float(x1 - x0)
            height = float(y1 - y0)
            if width < 30 or height < 30:
                continue
            # Skip full-page decorative backgrounds / watermarks
            page_rect = page.rect
            if width > page_rect.width * 0.95 and height > page_rect.height * 0.5:
                continue
            if y_ranges:
                img_mid = (y0 + y1) / 2.0
                if not any(low - 80 <= img_mid <= high + 80 for low, high in y_ranges):
                    continue
            xref = info.get("xref") or 0
            if not xref:
                continue
            try:
                extracted = doc.extract_image(xref)
            except Exception:
                continue
            if not extracted or not extracted.get("image"):
                continue
            ext = (extracted.get("ext") or "png").lower()
            if ext == "jpeg":
                ext = "jpg"
            image_bytes = extracted["image"]
            name = f"img-{page_no + 1}-{image_index}.{ext}"
            rel = f"{year}/questions/{folder}/{name}"
            out = dest_dir / rel
            out.parent.mkdir(parents=True, exist_ok=True)
            out.write_bytes(image_bytes)
            keys.append(f"asset:media/{rel}")
    seen: set[str] = set()
    unique: list[str] = []
    for key in keys:
        if key not in seen:
            seen.add(key)
            unique.append(key)
    return unique


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
    media_root = args.out  # media files land at <out>/media/... via rel path year/questions/...
    # Actually dest uses rel year/questions — put under out/media
    media_root = args.out

    gabarito = parse_gabarito(args.gabarito1)
    gabarito.update(parse_gabarito(args.gabarito2))

    doc1 = pymupdf.open(args.day1)
    doc2 = pymupdf.open(args.day2)
    pages = split_pages(doc1) + split_pages(doc2)
    blocks = parse_questions_from_pages(pages, args.year)

    # Attach page numbers by scanning again (global index across D1+D2).
    page_blocks: list[tuple[int, str | None, int]] = []
    current_language = None
    for global_page, page_text in enumerate(pages):
        for line in page_text.splitlines():
            clean = clean_line(line)
            if SECTION_EN.search(clean):
                current_language = "ingles"
            elif SECTION_ES.search(clean):
                current_language = "espanhol"
            elif (
                SECTION_06_45.search(clean)
                or SECTION_46_90.search(clean)
                or SECTION_91_135.search(clean)
                or SECTION_136_180.search(clean)
            ):
                current_language = None
            m = QUESTION_RE.match(clean)
            if m:
                number = int(m.group(1))
                if number > 5:
                    current_language = None
                page_blocks.append((number, current_language, global_page))

    pages_for: dict[tuple[int, str | None], list[int]] = {}
    for number, language, page_no in page_blocks:
        pages_for.setdefault((number, language), []).append(page_no)

    questions = []
    exam_questions = []
    for block in blocks:
        key = (block["index"], block["language"])
        page_list = sorted(set(pages_for.get(key, [])))
        media_keys: list[str] = []
        d1_pages = [p for p in page_list if p < doc1.page_count]
        d2_pages = [p - doc1.page_count for p in page_list if p >= doc1.page_count]
        media_keys += extract_images_for_pages(
            doc1, d1_pages, media_root, args.year, block["index"], block["language"]
        )
        media_keys += extract_images_for_pages(
            doc2, d2_pages, media_root, args.year, block["index"], block["language"]
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
