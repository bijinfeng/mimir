"""Refresh linkage metadata from the reviewed source inventory; not a browser assertion."""
import json
from pathlib import Path

root = Path(__file__).resolve().parent
catalog = json.loads((root.parent / 'research/library-scenes.json').read_text())
routes = {
'001': ('entry-routing', '点击评审工具“模拟首库重定向”观察导航反馈；无库时点击创建；加载时用读取成功/失败结束', '首库替换历史或进入无库引导'),
'002': ('onboarding', '创建知识库→输入名称和描述→保存→F6→模拟请求成功；取消则返回引导', '创建后进入根目录，取消保留引导'),
'003': ('kb-editor', '编辑名称和描述；保存触发校验；请求结果用F6工具；对账失败先用“模拟按稳定ID对账成功”再保存', '无图标；500字新描述限制、旧长描述不截断；失败留草稿；等待锁定'),
'004': ('identity-header', '进入参考资料并点击文档面包屑返回；长描述在提案侧展开/收起', '根知识库身份保持，子目录只改变文档面包屑'),
'005': ('identity-copy', 'hover/Tab聚焦整个知识库ID块→点击；剪贴板失败场景再次点击查看失败提示', '复制整块有反馈，缺少code则隐藏；实际剪贴板须宿主另验'),
'006': ('count-and-capacity', '加载场景点读取成功；100条场景在文档体滚动到底核对实际100行', '计数来自已读items，不伪造total；前后同100样例'),
'007': ('layout-preference', '列表/卡片相互切换→评审工具模拟重载偏好；存储异常场景仍可切换', '两种布局可用，偏好重载仅本地模拟，不写产品存储'),
'008': ('add-menu', '添加文档按钮→Enter/方向键→菜单项；上传/抓取进入带目录交接页；直接编辑用结果工具结束请求', '四入口带当前目录；系统选择器与完整模块4另验'),
'009': ('create-note', '新建文件或直接编辑→F6→失败；再次触发→成功；未保存守卫场景先处理守卫', '提案新建等待防重；成功打开未命名笔记，失败可重试'),
'010': ('new-actions', '桌面新建文件/文件夹；390px点击新建下拉；缺失节点检查禁用文件夹项', '窄屏合并新建，不凭空增加目录能力'),
'011': ('folder-editor', '新建文件夹→输入→Enter或创建；空/斜杠/60字/首尾空白分别校验；F6失败→改草稿重试→成功；取消后重开', '提案就地错误与等待防重，当前保留toast与取消/Enter缺口'),
'012': ('breadcrumb', '点击文档回根、中间目录返回上级；提案长路径点省略按钮展开完整路径', '当前末段是文本；长路径提案不撑破画布；未保存交接单列'),
'013': ('list-loading', '检查五行骨架→下方读取失败→重试→读取成功', '目录与标签初次读取均可结束，不用定时器假进度'),
'014': ('list-error', '失败页重试→读取成功/失败；缓存错误场景提案保留内容并点重新读取', '失败先于空判断；两query失败现状说明留在当前行为'),
'015': ('scope-switching', '新目录头部+旧文档→下方读取成功/失败', '当前无占位提示；提案提示旧数据来源，完成后提示消失'),
'016': ('missing-root', '缺失根库点击返回知识库；全部库已空时提案创建知识库再完成请求', '当前zero-roots缺口如实为空；提案回有效库或创建'),
'017': ('missing-child', '检查现有根、缺失子目录→提案返回知识库根目录', '当前泛化空态且禁用新建文件夹；提案准确定位并恢复'),
'018': ('empty-folder', '空根/空子目录的上传文件与直接编辑分别点击；F6完成新建或返回', '空目录路径保持；入口带当前folder'),
'019': ('tag-list', '列表/卡片切换；无创建上传入口；加载/失败用读取工具；长标签折行检查', '横切筛选显示真实来源位置，标签并非内容容器'),
'020': ('empty-tag', '比较空标签提示与实际可用入口', '当前错误上传提示保留；提案解释标签来源，不提供伪创建入口'),
'021': ('folder-browser', '点击文件夹行空白/名称或卡片进入子目录→面包屑返回；Tab聚焦名称', '只列直接子目录，文档含后代；目录计数与样例归属对应'),
'022': ('folder-menu', '文件夹更多→方向键上下遍历/Home/End→Escape回原更多；重命名/删除不进入目录', '菜单不触发行点击，更多按钮几何稳定'),
'023': ('folder-rename', '修改预填名称→Enter；空/斜杠/60字检查；失败留草稿→重试；未改直接关闭；取消回原更多', '只改同父级名称，不自由移动；提案等待锁关闭和重复提交'),
'024': ('folder-delete-empty', '默认取消焦点→删除→F6失败→重试成功；取消或Escape回原入口', '空目录不影响任何文档；mask不关闭；pending不可关闭'),
'025': ('folder-delete-populated', '删除确认→F6失败/成功→检查目录及其4篇后代文档从当前库消失', '实际folder=null，文档全局保留；提案纠正回当前库根的错误承诺'),
'026': ('document-list', '当前整行（含空白）Enter/点击打开；提案标题打开与行尾更多分别操作；hover测量', '当前没有文档行更多；提案是新增前端入口'),
'027': ('document-cards', '卡片空白/摘要/标题打开；更多菜单不得打开；键盘标题打开一次', '交互为平级按钮，卡片保留状态/来源/时间'),
'028': ('document-menu', '按note/web/editable/readonly场景打开更多；核对打开/编辑/下载/替换/删除的类型分支', '无文件重命名或浏览页移动；编辑入口仍交给详情能力'),
'029': ('format-catalog', '滚动检查16类格式图标、非文件来源徽标及更多菜单', '图标复制当前材料SVG；文件不重复格式徽标'),
'030': ('filename-overflow', '比较已有/缺少/大小写后缀与长名称；390px检查主体截断后缀保留', '不重复后缀，保留已有大小写，title包含全名'),
'031': ('document-metadata', '检查当前/后代/标签来源、空正文、未知大小与长摘要省略；hover查看完整title', '摘要不撑破列；当前目录文字省略规则依据源实现'),
'032': ('extraction-status', '全就绪列表与含失败列表比较表头；切390px检查失败移至名称次行；卡片查看状态', '有failed才启用独立状态列；ready不冒充导入处理中'),
'033': ('document-time', '对照有效/null时间；窄屏场景隐藏列表时间；切卡片查看时间', 'YYYY/MM/DD HH:mm，null不编造日期'),
'034': ('document-handoff', '打开文档交接页→返回知识库；未保存场景选择继续/放弃/保存后继续', '范围与id交接明确，不重画阅读器/Office工具栏'),
'035': ('download-boundary', '查看下载交接页→返回；对比真实浏览器下载须宿主记录', 'HTML不真实下载且不承诺点击即完成，无虚构成功'),
'036': ('replacement-chooser', '当前选择器边界或提案选择文件→取消/再次选择同一文件；提交后用结果工具', '原生取消不修改原件；此处仅模拟选择，不伪造OS弹窗'),
'037': ('replacement-request', '选择替换文件→替换→F6失败；重选重试→成功/无正文/提取失败', '当前无pendingUI，提案反馈真实保存和提取结果，不显示虚构百分比'),
'038': ('delete-note', '确认默认取消→删除→失败重试/成功；成功移除笔记，无一键恢复按钮', '笔记文件保留回收站的现有合同'),
'039': ('delete-original', '核对文件名与不可撤销后果→删除→失败重试或成功', '记录与原件均删除，无恢复承诺'),
'040': ('delete-source-record', '核对网页来源删除文案→失败重试/成功；比较当前错误成功反馈与提案资料记录反馈', '网页/公众号/GitHub均为来源记录分支，不谎称删除原件'),
'041': ('drop-boundary', '下方模拟拖入文件→忙态/部分失败/完成；标签/非文件/空输入模拟被忽略', '模拟不等于原生拖入验收；不支持目录重排'),
'042': ('inline-upload-handoff', 'topbar前页内导入结果→模拟部分失败/全部失败/完成→清空结果', '复用模块4，仅交接位置与目录；无真实业务请求'),
'043': ('sidebar-kb-handoff', '侧边栏复用入口的编辑/删除（空与非空）；删除失败重试、成功无库回创建；编辑对账错误需先对账', 'KB对象不混同子目录；完整导航细节复用模块2已批准HTML'),
'044': ('note-command-handoff', '文档交接页重命名笔记→未改关闭或改名提交；read-refresh-error仅重新读取', '仅笔记命令；不增加文件重命名或列表命令'),
'045': ('move-command-handoff', '目录读取失败先重读；Select选择目标；当前目标直接关闭；提交失败保留选择；写后读失败仅重读', '沿用模块3Select，空值当前标知识库根但实际清空folder，解释真实边界'),
'046': ('detail-directory-handoff', '目录菜单当前项禁用；选择其他目录或移出；无归属不显示移出；模拟撤销失败', '既有8秒撤销合同用显式模拟，不伪造计时或新能力'),
'047': ('scroll-layout', '真实100条滚动；scrolled直接初始scrollTop240；长描述低高度比较固定头部与内容视口', '提案保留可用文档视口；当前低高度缺口保留'),
'048': ('responsive-layout', '390浅深直接链接→新建下拉/布局/更多/弹窗；切低高度与长名', '双方相同容器尺寸，窄屏触屏更多始终可见'),
'049': ('interaction-microstates', '查看画布下方本状态具体步骤；Tab/Enter/方向键/Escape回焦；按住按钮；禁用新建文件夹', 'hover/pressed只改背景颜色，不变尺寸；减少动效可开关'),
'050': ('query-boundaries', '100条同数据按更新时间降序滚动；检查来源目录及无分页/无总数说明', '直接子目录在前，文档含后代；不伪造无限列表'),
'P01': ('shared-more-proposal', '提案列表行尾更多→卡片相同类型动作；切卡片对照；菜单动作不导航', '当前列表没有更多，提案明确新增前端入口'),
'P02': ('folder-form-proposal', '斜杠/空校验→正确名称提交→F6失败草稿保留→重试；pending尝试关闭/回车；IME不误提交', '中性1px边框轻轮廓、同步防重、失败恢复、稳定回焦'),
'P03': ('location-copy-proposal', '失效子目录返回有效库；无根创建新库；空标签只读真实提示', '三个差异独立画面，当前真实缺口保留'),
'P04': ('query-feedback-proposal', '切目录旧数据提示→读取结果；缓存刷新失败保留内容→重读；实际100行上限', '只修复查询反馈，不增加分页、total或接口'),
'P05': ('replace-feedback-proposal', '选择文件→替换→F6成功/失败/无正文/提取失败；失败重新选择；取消不改原件', '同一parse结果状态驱动反馈；无取消上传API或假百分比'),
'P06': ('delete-copy-proposal', '目录/网页资料/文件原件三种确认各核对对象和后果→失败/成功', '目录清空folder；资料移除记录；文件删除原件，均无恢复承诺'),
'P07': ('long-content-proposal', '提案展开/收起描述；长面包屑省略展开；390与低高度保持正文可滚动', '根身份与现有结构不改；防长内容挤掉所有文档区'),
'P08': ('browse-command-boundary', '查看文档命令交接；笔记重命名/目录移动仍在详情页触发→返回浏览', '本轮明确不新增浏览页移动/重命名，非待开发按钮'),
}
scenes=[]
coverage=[]
for item in catalog['items']:
 key=item['id'][4:]
 view,path,expect=routes[key]
 entries=[]
 for state in item['states']:
  item_id=item['id']+'.'+state
  micro = '；本状态微交互：hover/focus/keyboard通过真实指针或Tab/Enter操作，不用脚本注入状态' if state in ['hover','focus','keyboard','pressed','disabled','focus-return','reduced-motion'] else ''
  entry={'id':item_id,'itemId':item['id'],'state':state,'label':item['label'],'classification':item['classification'],'owner':item['owner'],'source':item['source'],'currentBehavior':item['current_behavior'],'view':view,'path':path+micro,'expected':expect}
  scenes.append(entry)
  entries.append({'state':state,'scene':item_id,'entry':'review.html#scene='+item_id,'view':view,'path':path+micro,'expected':expect})
 coverage.append({'id':item['id'],'label':item['label'],'classification':item['classification'],'states':entries})
(root/'scenes.json').write_text(json.dumps({'version':'library-review-v1','scenes':scenes},ensure_ascii=False,indent=2)+'\n')
(root/'coverage.json').write_text(json.dumps({'version':'library-review-v1','items':coverage},ensure_ascii=False,indent=2)+'\n')
print(f'{len(coverage)} coverage items, {len(scenes)} addressable states, {len(set(s[0] for s in routes.values()))} named semantic views')
