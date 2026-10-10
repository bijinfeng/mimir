# 会静默出错的地方

| 症状 | 原因 |
|---|---|
| **给 antd 控件的编辑/展开态写样式，改了却完全没生效** | antd 的 `Typography.Title editable` 进入编辑态时**会把 className 一起挂到编辑容器上**（实测容器的 classList 里就是我们的 `headerTitle` 哈希类），所以「我们的类 + 空格 + antd 类」这种**后代**选择器永远匹配不到——那个类的元素就是容器自己，要写成 `&.ant-typography-edit-content` 同元素式（与「树根样式写成后代式」是同一个坑，`DocumentPanel.style.ts` 的 `headerTitle`）。createStyles 模板里的反引号是另一条独立的坑，见[项目坑表](../../../project/pitfalls.md) |
| 编辑器标题字号不对（38px 或 28px） | 前者是 antd `Typography.Title` 的自带规则特异性更高；后者是抬了特异性之后纯 `<h1>` 又匹配不上、回落到浏览器默认 2em。两个分支都要用 `Typography.Title` |
