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
    for f in sorted(OUT.glob("*.pptx")):
        print(f.name, f.stat().st_size)
