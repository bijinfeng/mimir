# 新对话起始页二次精修验收

- 仅主空态的标题/说明/表单布局调整。图标22px并入标题行，标题沿用现有display角色28px；600px及以下19px，避免新增字号角色。说明14px，表单下键位提示12px。
- 真实组件浅色1440/1100/880/600四档与深色1093均有同尺寸同内容的前后截图。主区宽720px；600px时552px。说明与表单边界间距均24px，标题/表单左缘一致，没有页面横向溢出。详见layout-metrics.json。
- 实际产品深色1093×873截图保留完整侧栏上下文。修改前为本轮实施前真实截图，非用户旧截图；冻结源码基线0c44cde。
- 600×360短窗，24行草稿：滚动区clientHeight270/scrollHeight429，底部scrollTop159，表单底部265.23px可见；滚轮回到scrollTop0，标题top105.84px可见。详见interaction-metrics.json。长草稿textarea最大高度190px，无顶部居中裁切。
- 模型菜单在600×360内完整显示，Escape关闭；思考强度选择中，范围选择知识整理指南后触发器反映选择。Shift+Enter保留换行，仍在空态。空稿发送禁用，非空稿启用。仅模拟IO页面操作，未发送真实模型请求，未重新验证真实上传/检索/持久化。
- 独立review发现初版24px字面量违反宿主字号合同，已改现有display变量；最终源码重新构建后重新采集全部after截图。
- Chat既有88项测试、Renderer设计守卫109项、定向lint/format/typecheck通过。完整 `pnpm check` 最终退出码0，日志见full-check.txt；Office2711、Renderer591、Chat88及其余包/服务端常规、本地、fnOS、宿主脚本检查全部通过。Storage既有2项跳过保留。
- 普通消息、文档助手guide、发送/队列/附件/模型运行层均未变。未为可逆外观改动添加镜像CSS测试。

## 复现

使用已存档真实组件gallery，相同fixture、相同依赖；baseline设置GALLERY_SOURCE_ROOT为git archive导出的0c44cde树，after用当前仓库。两次均vite build，scene=empty，theme参数和窗口尺寸见manifest。静态bundle哈希已记录；截图为未经缩放的浏览器JPEG。HTML对比页不依赖服务器，但请连同before/after目录保存。

对比页在浏览器实际打开，六组场景切换、图片加载与原尺寸链接均验收；图片尺寸与SHA以及产品源码SHA核对一致。
