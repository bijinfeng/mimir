#!/usr/bin/env python3
"""生成 pptx 测试夹具（`packages/office/src/pptx.test.ts` 用）。

为什么不 vendored 一份真实演示文稿：这里要断言的是**我们的装配**
（占位符位置从版式上溯、多段落解析），需要精确知道某句话应该落在哪个坐标，
以及「幻灯片自己的 XML 里没有位置」这个前提。真实文件反而不好断言。

需要 python-pptx：`pip install python-pptx`

用法：python3 tests/fixtures/make-pptx-fixtures.py
"""
from pathlib import Path
from pptx import Presentation
from pptx.util import Inches

OUT = Path(__file__).parent


def title_layout() -> None:
    """用版式建的标题页：标题与正文的位置只在 slideLayout1.xml 里。

    `slide1.xml` 里两个占位符的 `<p:spPr/>` 是空的——这正是「不走上溯就会
    叠在 (0,0)」那个静默错位的夹具。
    """
    prs = Presentation()
    slide = prs.slides.add_slide(prs.slide_layouts[1])  # Title and Content
    slide.shapes.title.text = "用版式建的标题页"
    body = slide.placeholders[1]
    body.text = "第一条"
    body.text_frame.add_paragraph().text = "第二条"
    prs.save(OUT / "title-layout.pptx")


def empty_deck() -> None:
    """没有任何幻灯片：`openPptx` 应当报错，而不是渲染一张空白画布。"""
    Presentation().save(OUT / "empty-deck.pptx")


if __name__ == "__main__":
    title_layout()
    empty_deck()
    image_deck()
    formatted_text()
    for f in sorted(OUT.glob("*.pptx")):
        print(f.name, f.stat().st_size)


def image_deck() -> None:
    """带图片的一页：验证「改文字不会重写媒体条目」。

    图片是二进制——如果保存路径把它重新压缩一遍，每个字节都会变，
    而那是**静默**的（文件还能打开，只是体积与内容都悄悄变了）。
    """
    from io import BytesIO

    from PIL import Image, ImageDraw

    img = Image.new("RGB", (300, 200), "#2f6fed")
    ImageDraw.Draw(img).rectangle([10, 10, 120, 90], fill="#f2b705")
    buf = BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)

    prs = Presentation()
    slide = prs.slides.add_slide(prs.slide_layouts[5])
    slide.shapes.title.text = "带图的一页"
    slide.shapes.add_picture(buf, Inches(1), Inches(2), width=Inches(3))
    prs.save(OUT / "image-deck.pptx")


def formatted_text() -> None:
    """每个 run 都带显式格式（加粗/字号/颜色/字体）。

    验证「改文字不动格式」：`patchTextElementXml` 应该只换 `<a:t>` 的内容，
    `rPr` 的每个属性与子节点都保持原字节。格式丢了是**静默**的——文字还在，
    只是变成了另一个样子。
    """
    from pptx.dml.color import RGBColor

    prs = Presentation()
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    frame = slide.shapes.add_textbox(Inches(1), Inches(1), Inches(6), Inches(3)).text_frame

    first = frame.paragraphs[0].add_run()
    first.text = "加粗大字"
    first.font.bold = True
    first.font.size = Pt(28)
    first.font.name = "Arial"
    first.font.color.rgb = RGBColor(0xC0, 0x39, 0x2B)

    second = frame.add_paragraph().add_run()
    second.text = "斜体小字"
    second.font.size = Pt(12)
    second.font.name = "宋体"
    second.font.italic = True

    prs.save(OUT / "formatted-text.pptx")
