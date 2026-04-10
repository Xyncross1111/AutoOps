from __future__ import annotations

import copy
import os
import shutil
import struct
import tempfile
import zipfile
from io import BytesIO
from pathlib import Path
from xml.etree import ElementTree as ET


DOCX_PATH = Path("/opt/AutoOps/AutomatedCICD (2).docx")
BACKUP_PATH = Path("/opt/AutoOps/AutomatedCICD (2).docx.bak")

REPLACEMENT_IMAGES = {
    "word/media/image5.png": Path("/opt/AutoOps/results-assets/activity-webhook-log.png"),
    "word/media/image6.png": Path("/opt/AutoOps/results-assets/overview-dashboard.png"),
    "word/media/image7.png": Path("/opt/AutoOps/results-assets/runs-failed-run-log.png"),
    "word/media/image8.png": Path("/opt/AutoOps/results-assets/deployments-revision-ledger.png"),
}

PARAGRAPH_REPLACEMENTS = {
    "This dashboard shown in figure 6 shows the categorization of severity of alerts as critical, high, and medium. It also provides a summary of vulnerability as Regular Expression Denial of Service (ReDoS) or Prototype Pollution. Whenever a developer chooses an alert from the list, the AI engine performs generate the human-readable remediation and bridge the gap between developer insight and raw security logs.": (
        "Figure 5 shows a webhook event captured in the AutoOps activity timeline. "
        "The dashboard records the event type, verification status, actor, repository, and raw metadata such as the delivery identifier and authenticated branch reference. "
        "This confirms that webhook intake and signature validation were handled successfully before pipeline execution began."
    ),
    "Fig 5. Webhook log of Successful Capture of Security Alerts": (
        "Fig. 5. Webhook event capture and HMAC signature validation recorded in the AutoOps activity timeline."
    ),
    "The centralized security dashboard is illustrated in Fig. 6. It defines repository-level advisories through GitHub’s vulnerability tracking API. This allows developers to authenticate and retreive specific repositories in real-time.  It acts as the primary data source for the subsequent AI-assisted analysis phase.": (
        "Figure 6 presents three dashboard views from the implemented platform: the operational overview, the failed-run log inspector, and the deployment revision ledger. "
        "Together, these views demonstrate execution monitoring, debugging traceability, and controlled deployment management inside the self-hosted AutoOps workflow."
    ),
    "Fig. 6. Dependency Level Vulnerabilities and Severity Classification.": (
        "Fig. 6. AutoOps operational dashboards showing overview metrics, failed-run traceability, and deployment revision history."
    ),
}

NS = {
    "w": "http://purl.oclc.org/ooxml/wordprocessingml/main",
    "a": "http://purl.oclc.org/ooxml/drawingml/main",
    "r": "http://purl.oclc.org/ooxml/officeDocument/relationships",
    "wp": "http://purl.oclc.org/ooxml/drawingml/wordprocessingDrawing",
}


def register_namespaces(xml_bytes: bytes) -> None:
    seen: set[tuple[str, str]] = set()
    for _event, item in ET.iterparse(BytesIO(xml_bytes), events=("start-ns",)):
        if item in seen:
            continue
        seen.add(item)
        prefix, uri = item
        ET.register_namespace(prefix, uri)


def read_png_size(path: Path) -> tuple[int, int]:
    with path.open("rb") as handle:
        signature = handle.read(8)
        if signature != b"\x89PNG\r\n\x1a\n":
            raise ValueError(f"{path} is not a PNG file")
        length = struct.unpack(">I", handle.read(4))[0]
        chunk_type = handle.read(4)
        if length != 13 or chunk_type != b"IHDR":
            raise ValueError(f"{path} does not contain a valid PNG IHDR chunk")
        width, height = struct.unpack(">II", handle.read(8))
        return width, height


def paragraph_text(paragraph: ET.Element) -> str:
    text_parts = []
    for node in paragraph.findall(".//w:t", NS):
        text_parts.append(node.text or "")
    return "".join(text_parts).strip()


def set_paragraph_text(paragraph: ET.Element, text: str) -> None:
    ppr = paragraph.find("w:pPr", NS)
    first_rpr = paragraph.find("w:r/w:rPr", NS)

    for child in list(paragraph):
        if child is ppr:
            continue
        paragraph.remove(child)

    run = ET.SubElement(paragraph, f"{{{NS['w']}}}r")
    if first_rpr is not None:
        run.append(copy.deepcopy(first_rpr))

    text_node = ET.SubElement(run, f"{{{NS['w']}}}t")
    if text.startswith(" ") or text.endswith(" "):
        text_node.set("{http://www.w3.org/XML/1998/namespace}space", "preserve")
    text_node.text = text


def update_paragraphs(root: ET.Element) -> None:
    body = root.find("w:body", NS)
    if body is None:
        raise ValueError("Document body not found")

    for paragraph in body.findall(".//w:p", NS):
        text = paragraph_text(paragraph)
        if not text:
            continue
        replacement = PARAGRAPH_REPLACEMENTS.get(text)
        if replacement:
            set_paragraph_text(paragraph, replacement)


def update_image_sizes(root: ET.Element) -> None:
    relationship_to_media = {
        "rId13": REPLACEMENT_IMAGES["word/media/image5.png"],
        "rId14": REPLACEMENT_IMAGES["word/media/image6.png"],
        "rId15": REPLACEMENT_IMAGES["word/media/image7.png"],
        "rId16": REPLACEMENT_IMAGES["word/media/image8.png"],
    }

    for drawing in root.findall(".//w:drawing", NS):
        blip = drawing.find(".//a:blip", NS)
        if blip is None:
            continue
        relationship_id = blip.get(f"{{{NS['r']}}}embed")
        if relationship_id not in relationship_to_media:
            continue

        image_path = relationship_to_media[relationship_id]
        image_width, image_height = read_png_size(image_path)

        wp_extent = drawing.find(".//wp:extent", NS)
        a_ext = drawing.find(".//a:xfrm/a:ext", NS)
        if wp_extent is None or a_ext is None:
            continue

        width_emu = int(wp_extent.get("cx", "0"))
        height_emu = round(width_emu * image_height / image_width)

        wp_extent.set("cy", str(height_emu))
        a_ext.set("cx", str(width_emu))
        a_ext.set("cy", str(height_emu))


def build_updated_document_xml() -> bytes:
    with zipfile.ZipFile(DOCX_PATH) as source:
        xml_bytes = source.read("word/document.xml")

    register_namespaces(xml_bytes)
    root = ET.fromstring(xml_bytes)
    update_paragraphs(root)
    update_image_sizes(root)

    return ET.tostring(root, encoding="UTF-8", xml_declaration=True)


def write_updated_docx(document_xml: bytes) -> None:
    if not BACKUP_PATH.exists():
        shutil.copy2(DOCX_PATH, BACKUP_PATH)

    with tempfile.NamedTemporaryFile(delete=False, suffix=".docx") as temp_file:
        temp_path = Path(temp_file.name)

    try:
        with zipfile.ZipFile(DOCX_PATH) as source, zipfile.ZipFile(temp_path, "w") as target:
            for info in source.infolist():
                if info.filename == "word/document.xml":
                    target.writestr(info, document_xml)
                    continue

                replacement = REPLACEMENT_IMAGES.get(info.filename)
                if replacement is not None:
                    target.writestr(info, replacement.read_bytes())
                    continue

                target.writestr(info, source.read(info.filename))

        os.replace(temp_path, DOCX_PATH)
    finally:
        if temp_path.exists():
            temp_path.unlink()


def main() -> None:
    missing = [str(path) for path in REPLACEMENT_IMAGES.values() if not path.exists()]
    if missing:
        raise FileNotFoundError(f"Missing replacement screenshots: {missing}")

    updated_xml = build_updated_document_xml()
    write_updated_docx(updated_xml)
    print(f"Updated {DOCX_PATH}")
    print(f"Backup saved at {BACKUP_PATH}")


if __name__ == "__main__":
    main()
