#!/usr/bin/env python3
"""从已归册原书PDF首面重建Hello缩略封面，保留水印与来源元数据。

运行：python3 scripts/extract-hello-covers.py
视频截图：python3 scripts/extract-hello-covers.py --frame 1 /绝对路径/官方1号书封面证据.png
依赖：PyMuPDF、Pillow。1号与9号原PDF无封面，保留单独核对的视频截图封面。
"""
from pathlib import Path
import argparse
import json
import fitz
from PIL import Image

ROOT = Path(__file__).resolve().parents[1] / "english"
DATA = ROOT / "data/hello-reading.json"


def extract(frames):
    data = json.loads(DATA.read_text())
    output = ROOT / "assets/hello/covers"
    output.mkdir(parents=True, exist_ok=True)
    count = 0
    for book in data["books"]:
        if book["number"] in (1, 9):
            continue
        resource = next(item for item in book["resources"]
                        if item["kind"] == "pdf"
                        and f'{book["number"]}号书' in item["label"])
        with fitz.open(ROOT / resource["file"]) as document:
            pixmap = document[0].get_pixmap()
            image = Image.frombytes("RGB", (pixmap.width, pixmap.height), pixmap.samples)
        # 仅裁去纯白外边，封面图文、来源水印及其内部留白完整保留。
        bounds = image.point(lambda value: 255 if value < 245 else 0).convert("L").getbbox()
        if bounds:
            image = image.crop(bounds)
        image.thumbnail((320, 420), Image.Resampling.LANCZOS)
        target = output / f'{book["id"]}.jpg'
        image.save(target, quality=86, optimize=True)
        book["cover"] = target.relative_to(ROOT).as_posix()
        book["coverSource"] = {
            "type": "pdf", "file": resource["file"], "page": 1,
            "label": resource["label"] + " · 封面", "checkedAt": "2026-11-04"
        }
        count += 1
    for number, screenshot in frames:
        book = next(item for item in data["books"] if item["number"] == int(number))
        source = book["coverSource"]
        if source["type"] != "video-frame":
            raise ValueError("本册尚无已核对的视频截图裁剪信息")
        image = Image.open(screenshot).convert("RGB").crop(tuple(source["cropPixels"]))
        image.thumbnail((320, 420), Image.Resampling.LANCZOS)
        image.save(ROOT / book["cover"], quality=92, optimize=True)
    DATA.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")
    print(f"已重建 {count} 册PDF封面；1号与9号保留人工核对的视频截图。")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--frame", action="append", nargs=2, metavar=("BOOK", "SCREENSHOT"), default=[])
    extract(parser.parse_args().frame)
