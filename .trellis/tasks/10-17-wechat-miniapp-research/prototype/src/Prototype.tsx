import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import brandSvg from "../public/mimir.svg?raw";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Copy,
  File,
  FileText,
  Folder,
  History,
  Link,
  ListFilter,
  LogOut,
  MessageCircle,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Square,
  User,
  WifiOff,
} from "lucide-react";
import {
  BottomSheet,
  KeyboardInput,
  KeyboardTextarea,
  MobileScroll,
  useKeyboard,
  useKeyboardInsets,
} from "./mobile";

type Page =
  | "ask"
  | "library"
  | "folder"
  | "read"
  | "edit"
  | "append"
  | "capture"
  | "history"
  | "mine"
  | "login"
  | "viewer";
type Sheet =
  | ""
  | "scope"
  | "citation"
  | "save"
  | "actions"
  | "metadata"
  | "conflict"
  | "leave"
  | "folder"
  | "logout";
type Doc = {
  id: string;
  title: string;
  kind: "note" | "web" | "pdf";
  folder: string;
  body: string;
  tags: string[];
  summary: string;
};
const body =
  "## 为什么要做每周回顾\n\n回顾不是整理所有笔记，而是让已经读过的资料再次参与思考。\n\n## 一个轻量的回顾流程\n\n1. 回看本周新增的资料，找出值得继续思考的问题。\n2. 把有联系的笔记放在一起，用自己的话写下理解。\n3. 留下一个下周可以继续的问题。\n\n> 每周五留出 20 分钟，只回顾本周真正用过的资料。\n\n## 检查清单\n\n- [ ] 哪个想法改变了我的判断？\n- [ ] 哪些结论需要再找一份来源？\n- [ ] 下一步准备做什么？";
const seed: Doc[] = [
  {
    id: "review",
    title: "每周回顾：让知识重新流动",
    kind: "note",
    folder: "个人知识管理",
    body,
    tags: ["方法", "回顾"],
    summary: "每周留出 20 分钟，把资料变成自己的理解。",
  },
  {
    id: "article",
    title: "从收藏到理解：建立自己的知识系统",
    kind: "web",
    folder: "个人知识管理",
    body: "## 收集之后，还需要什么\n\n收藏让资料可被找到，理解让资料可被使用。为每份资料写下一句自己的判断，再链接到正在思考的问题。\n\n## 定期回顾\n\n每周检查值得继续的问题，不必重新阅读全部资料。",
    tags: ["方法"],
    summary: "建立联系，比增加收藏数量更重要。",
  },
  {
    id: "pdf",
    title: "个人知识管理实践手册.pdf",
    kind: "pdf",
    folder: "个人知识管理",
    body: "## 第三章：回顾机制\n\n有效的回顾应由问题驱动。每周选择少量有价值的资料，比较不同观点，再形成自己的行动。\n\n## 附录：把回顾变成习惯\n\n长文末尾的建议：将回顾时间固定在每周五的 20 分钟。",
    tags: ["参考"],
    summary: "从记录、关联到回顾的完整实践。",
  },
  {
    id: "rag",
    title: "检索增强生成的实践笔记",
    kind: "note",
    folder: "技术笔记",
    body: "## 先检索，再回答\n\n检索范围必须在召回阶段生效。无命中时应明确说明，不扩大范围。",
    tags: ["AI", "检索"],
    summary: "先找到相关段落，再组织有来源的回答。",
  },
];
const libs = [
  { name: "个人知识管理", description: "记录、关联与回顾" },
  { name: "技术笔记", description: "开发中值得留下的经验" },
  { name: "阅读随记", description: "读过之后，留下自己的理解" },
];
const brandMark = `data:image/svg+xml,${encodeURIComponent(brandSvg)}`;
const scenarios: [string, Page, string][] = [
  ["开始提问", "ask", "范围 → 回答 → 引用 → 存为笔记"],
  ["浏览知识库", "library", "知识库 → 文档列表 → 阅读"],
  ["阅读与单篇问答", "read", "读原文，再问这篇"],
  ["编辑笔记", "edit", "Markdown 源文、预览与保存"],
  ["保存冲突", "edit", "保留草稿、重新读取或另存"],
  ["链接入库", "capture", "粘贴链接，选择存入位置"],
  ["抓取失败", "capture", "保留输入，修改后重试"],
  ["原件查看", "viewer", "微信查看器边界与返回路径"],
  ["中断恢复", "ask", "部分回答保留，不自动重复提问"],
  ["账号登录", "login", "固定实例与现有账号"],
];
function Icon({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button className="icon-btn" aria-label={label} title={label} onClick={onClick}>
      {children}
    </button>
  );
}
function Markdown({ text }: { text: string }) {
  return (
    <div className="prose">
      {text.split("\n\n").map((p, i) =>
        p.startsWith("## ") ? (
          <h2 key={i}>{p.slice(3)}</h2>
        ) : p.startsWith("> ") ? (
          <blockquote key={i}>{p.slice(2)}</blockquote>
        ) : /^\d\. /.test(p) ? (
          <ol key={i}>
            {p.split("\n").map((s, j) => (
              <li key={j}>{s.replace(/^\d\. /, "")}</li>
            ))}
          </ol>
        ) : p.startsWith("- [") ? (
          <div className="checklist" key={i}>
            {p.split("\n").map((s, j) => (
              <p key={j}>
                <Square size={15} />
                {s.slice(6)}
              </p>
            ))}
          </div>
        ) : (
          <p key={i}>{p}</p>
        ),
      )}
    </div>
  );
}
export default function Prototype() {
  const [page, setPage] = useState<Page>("ask"),
    [readFrom, setReadFrom] = useState<Page>("folder"),
    [sheet, setSheet] = useState<Sheet>("");
  const [docs, setDocs] = useState(seed),
    [id, setId] = useState("review"),
    [library, setLibrary] = useState(libs[0].name);
  const doc = docs.find((d) => d.id === id) ?? docs[0];
  const [scope, setScope] = useState("全部知识库"),
    [mode, setMode] = useState("ask"),
    [query, setQuery] = useState(""),
    [searched, setSearched] = useState("");
  const [question, setQuestion] = useState(""),
    [answerScope, setAnswerScope] = useState("全部知识库"),
    [evidence, setEvidence] = useState<Doc[]>([]);
  const [answer, setAnswer] = useState<"empty" | "loading" | "done" | "interrupted">("empty"),
    [tick, setTick] = useState(0),
    [saved, setSaved] = useState("");
  const [draft, setDraft] = useState(body),
    [title, setTitle] = useState(seed[0].title),
    [baseline, setBaseline] = useState(body),
    [kept, setKept] = useState(false),
    [newNote, setNew] = useState(false),
    [draftDoc, setDraftDoc] = useState("review"),
    [draftTarget, setDraftTarget] = useState(libs[0].name),
    [preview, setPreview] = useState(false),
    [draftMode, setDraftMode] = useState<"edit" | "append">("edit"),
    [conflict, setConflict] = useState(false);
  const [citation, setCitation] = useState<number | null>(null);
  const [target, setTarget] = useState(libs[0].name),
    [url, setUrl] = useState(""),
    [capture, setCapture] = useState<"idle" | "loading" | "done" | "error">("idle"),
    [error, setError] = useState("");
  const [metaTitle, setMetaTitle] = useState(""),
    [tags, setTags] = useState(""),
    [toast, setToast] = useState(""),
    [dark, setDark] = useState(false),
    [scene, setScene] = useState("开始提问"),
    [filtered, setFiltered] = useState(false);
  const [email, setEmail] = useState("admin@example.com"),
    [password, setPassword] = useState("12345678");
  const keyboard = useKeyboard(),
    { bottomInset, isKeyboardVisible } = useKeyboardInsets();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const appRef = useRef<HTMLDivElement>(null);
  const answerScroll = useRef<number | null>(null);
  const dirty =
    draftMode === "append"
      ? Boolean(draft.trim())
      : newNote || draft !== baseline || title !== doc.title;
  const single = !libs.some((l) => l.name === answerScope) && answerScope !== "全部知识库";
  const snapshotEvidence = (range: string, documentId: string, available = docs) => {
    const documentScope = range !== "全部知识库" && !libs.some((l) => l.name === range);
    return available
      .filter((d) => range === "全部知识库" || (documentScope ? d.id === documentId : d.folder === range))
      .slice(0, 2)
      .map((d) => ({ ...d, tags: [...d.tags] }));
  };
  const source = evidence[0] ?? seed[0];
  const technical = source.id === "rag";
  const answerText = technical
    ? "这份实践笔记强调：检索范围必须在召回阶段生效。无命中时应明确说明，不扩大范围，再用找到的相关段落组织有来源的回答。"
    : single
      ? `这篇资料建议从回看、关联与行动三个步骤开始。关于具体的回顾安排，文中写道：每周五留出 20 分钟，只回顾本周真正用过的资料。`
      : "可以从「固定时间、筛选资料、留下问题」三步开始。每周只处理真正用过的资料，把回顾变成一次短而有产出的思考。";
  const answerHeading = technical ? "让范围约束贯穿检索流程" : "用 20 分钟完成一次回顾";
  const answerSteps = technical
    ? [
        "召回前过滤|在取回候选段落前应用知识库范围。",
        "无命中就说明|不把搜索范围扩大到其他文档。",
        "回答保留来源|使用相关段落组织有依据的回答。",
      ]
    : [
        "5 分钟回看|挑出本周真正有用的资料，留下自己的判断。",
        "10 分钟关联|比较相近观点，用自己的话补一条笔记。",
        "5 分钟收尾|留下一个下周可以继续追问的问题。",
      ];
  const citationNumber = (index: number) => (evidence.length === 1 ? 1 : index === 1 ? 2 : 1);
  const answerMarkdown = [
    answerText,
    "## " + answerHeading,
    answerSteps
      .map((step, index) => `${index + 1}. ${step.replace("|", "：")} [${citationNumber(index)}]`)
      .join("\n"),
    "## 参考来源",
    evidence.map((item, index) => `${index + 1}. ${item.title}`).join("\n"),
  ].join("\n\n");
  const notify = (t: string) => setToast(t);
  const go = (p: Page) => {
    keyboard.hide();
    setSheet("");
    setPage(p);
    setError("");
  };
  const open = (s: Sheet) => {
    keyboard.hide();
    setSheet(s);
  };
  const read = (d: Doc) => {
    if (page === "ask")
      answerScroll.current = appRef.current?.querySelector(".app-body .mobile-scroll")?.scrollTop ?? 0;
    setReadFrom(page);
    setId(d.id);
    setLibrary(d.folder);
    go("read");
  };
  const edit = (isNew = false, append = false) => {
    if (kept && (draftDoc !== id || isNew)) {
      setId(draftDoc);
      setLibrary(
        newNote ? draftTarget : (docs.find((item) => item.id === draftDoc)?.folder ?? draftTarget),
      );
      go("read");
      notify("请先保存或放弃已保留的草稿，再编辑其他笔记");
      return false;
    }
    setPreview(false);
    const resume = !isNew && kept && draftDoc === id;
    if (!resume) {
      setNew(isNew);
      setDraftMode(append ? "append" : "edit");
      setKept(false);
      setConflict(false);
      setDraftDoc(id);
      setDraftTarget(isNew ? library : doc.folder);
      setDraft(isNew || append ? "" : doc.body);
      setBaseline(isNew ? "" : doc.body);
      setTitle(isNew ? "" : doc.title);
    }
    go(resume ? draftMode : append ? "append" : "edit");
    return true;
  };
  const showCitation = (number: number | null) => {
    setCitation(number);
    open("citation");
  };
  const organize = () => {
    setMetaTitle(doc.title);
    setTags(doc.tags.join("，"));
    setTarget(doc.folder);
    open("actions");
  };
  const askDoc = () => {
    setScope(doc.title);
    setMode("ask");
    setAnswer("empty");
    setQuery("");
    go("ask");
  };
  const restoreConversation = (value: string, interrupted = false) => {
    // The two demo history entries retain the sources captured for those answers.
    setQuestion(value);
    setScope(libs[0].name);
    setAnswerScope(libs[0].name);
    setEvidence(snapshotEvidence(libs[0].name, "review", seed));
    setMode("ask");
    setSaved("");
    setTick(interrupted ? 1 : 6);
    setAnswer(interrupted ? "interrupted" : "done");
  };
  const send = (value = query) => {
    if (!value.trim() || answer === "loading") return;
    keyboard.hide();
    if (mode === "search") {
      setSearched(value.trim());
      setQuery("");
      return;
    }
    setQuestion(value.trim());
    setAnswerScope(scope);
    setEvidence(snapshotEvidence(scope, id));
    setAnswer("loading");
    setTick(0);
    setSaved("");
    setQuery("");
  };
  useEffect(() => {
    document.title = "mimir · 微信小程序交互原型";
  }, []);
  useEffect(() => {
    if (page !== "ask" || answerScroll.current === null) return;
    const scroll = appRef.current?.querySelector(".app-body .mobile-scroll");
    if (scroll) scroll.scrollTop = answerScroll.current;
    answerScroll.current = null;
  }, [page]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 2800);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    if (answer !== "loading") return;
    const t = setInterval(() => setTick((n) => n + 1), 200);
    return () => clearInterval(t);
  }, [answer]);
  useEffect(() => {
    if (answer === "loading" && tick >= 6) setAnswer("done");
  }, [tick, answer]);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const save = (asNew = false) => {
    keyboard.hide();
    if (!title.trim()) {
      notify("请先填写笔记标题");
      return;
    }
    if ((conflict || (draftMode === "append" && doc.body !== baseline)) && !asNew) {
      setConflict(true);
      open("conflict");
      return;
    }
    if (newNote || asNew) {
      const nid = `note-${Date.now()}`;
      setDocs((ds) => [
        ...ds,
        {
          ...seed[0],
          id: nid,
          title: title + (asNew ? "（草稿副本）" : ""),
          body: draft,
          folder: draftTarget,
        },
      ]);
      setId(nid);
      setLibrary(draftTarget);
    } else {
      setDocs((ds) =>
        ds.map((d) =>
          d.id !== id
            ? d
            : draftMode === "append"
              ? { ...d, body: d.body + "\n\n" + draft.trim() }
              : { ...d, title, body: draft },
        ),
      );
    }
    setKept(false);
    setConflict(false);
    setNew(false);
    setBaseline(draft);
    go("read");
    notify(asNew ? "已另存为新笔记" : draftMode === "append" ? "内容已追加到笔记" : "笔记已保存");
  };
  const collect = () => {
    keyboard.hide();
    if (!/^https?:\/\/[^\s/]+(?:\/.*)?$/.test(url)) {
      setError("请输入完整的 http 或 https 链接");
      return;
    }
    setError("");
    setCapture("loading");
    timer.current = setTimeout(() => {
      setCapture("done");
      setDocs((ds) =>
        ds.some((d) => d.id === "captured")
          ? ds
          : [...ds, { ...seed[1], id: "captured", title: "让知识重新参与思考", folder: target }],
      );
    }, 1400);
  };
  const scenario = (label: string, p: Page) => {
    if (timer.current) clearTimeout(timer.current);
    keyboard.hide();
    setScene(label);
    setReadFrom("folder");
    setPage(p);
    setSheet("");
    setId(label === "原件查看" ? "pdf" : "review");
    setLibrary(libs[0].name);
    setScope("全部知识库");
    setMode("ask");
    setAnswer("empty");
    setEvidence([]);
    setSearched("");
    setQuery("");
    setCapture("idle");
    setError("");
    setNew(false);
    setDraftMode("edit");
    setCitation(null);
    answerScroll.current = null;
    setKept(false);
    setDraftTarget(libs[0].name);
    setPreview(false);
    setConflict(label === "保存冲突");
    setDraft(body);
    setBaseline(body);
    setTitle(seed[0].title);
    setFiltered(false);
    if (label === "保存冲突") {
      setDocs((ds) =>
        ds.map((d) =>
          d.id === "review"
            ? {
                ...d,
                body: body + "\n\n## 电脑端新增\n\n本周回顾先关注检索质量，再检查未完成的问题。",
              }
            : d,
        ),
      );
      setDraftDoc("review");
      setDraft(body + "\n\n手机补记：下周从一个具体问题开始。");
      setSheet("conflict");
    }
    if (label === "抓取失败") {
      setUrl("https://mp.weixin.qq.com/s/example");
      setCapture("error");
    }
    if (label === "中断恢复") {
      restoreConversation("怎样做一次有产出的每周回顾？", true);
    }
  };
  const rows = (items: Doc[], showExcerpt = false) =>
    items.map((d) => (
      <button className="doc-row" key={d.id} onClick={() => read(d)}>
        <span className={"file-icon " + d.kind}>
          {d.kind === "web" ? (
            <Link size={21} />
          ) : d.kind === "pdf" ? (
            <File size={21} />
          ) : (
            <FileText size={21} />
          )}
        </span>
        <span className="row-copy">
          <strong>{d.title}</strong>
          {showExcerpt && <span>{d.summary}</span>}
          <small>
            {d.kind === "note" ? "笔记" : d.kind === "web" ? "网页资料" : "PDF"} · 今天
            10:24
          </small>
        </span>
        <ChevronRight size={16} />
      </button>
    ));
  const hits = docs.filter(
    (d) =>
      (scope === "全部知识库" || scope === d.folder || scope === d.title) &&
      (d.title + d.body).includes(searched),
  );
  const titles: Record<Page, string> = {
    ask: "问答",
    library: "知识库",
    folder: library,
    read: "阅读",
    edit: newNote ? "新建笔记" : "编辑笔记",
    append: "追加内容",
    capture: "链接入库",
    history: "会话历史",
    mine: "我的",
    login: "mimir",
    viewer: "原件查看",
  };
  const sheetTitles: Record<string, string> = {
    scope: "选择范围",
    citation: citation === null ? "全部参考资料" : `引用 ${citation}`,
    save: "存为笔记",
    actions: "文档操作",
    metadata: "文档信息",
    conflict: "这篇笔记有了新版本",
    leave: "保留未保存的内容？",
    folder: "选择存入位置",
    logout: "退出当前账号？",
  };
  const tabs = ["ask", "library", "folder", "mine"].includes(page);
  return (
    <>
      {createPortal(
        <aside className="review-controls" aria-label="原型评审工具">
          <div className="review-control-row">
            <label htmlFor="prototype-scene">原型场景</label>
            <select
              id="prototype-scene"
              aria-label="选择原型场景"
              value={scene}
              onChange={(e) => {
                const s = scenarios.find((s) => s[0] === e.target.value)!;
                scenario(s[0], s[1]);
              }}
            >
              {scenarios.map((s) => (
                <option key={s[0]}>{s[0]}</option>
              ))}
            </select>
            <button onClick={() => setDark(!dark)}>
              {dark ? "浅色外观" : "深色外观"}
            </button>
          </div>
          <p>模拟资料与结果 · 未连接真实服务</p>
        </aside>,
        document.body,
      )}
      <div ref={appRef} data-page={page} className={"mimir-app" + (dark ? " dark" : "")}>
        <header className="mini-header">
          <div className="mini-title">
            {!["ask", "library", "mine", "login"].includes(page) && (
              <Icon
                label="返回"
                onClick={() =>
                  (page === "edit" || page === "append") && dirty
                    ? open("leave")
                    : go(
                        page === "read"
                          ? readFrom
                          : page === "capture"
                            ? "folder"
                            : page === "viewer"
                              ? "read"
                              : page === "edit" || page === "append"
                                ? "read"
                                : page === "folder"
                                  ? "library"
                                  : "ask",
                      )
                }
              >
                <ArrowLeft size={20} />
              </Icon>
            )}
            {page === "login" && <img src={brandMark} alt="" />}
            <span>{titles[page]}</span>
          </div>
          <span className="wechat-capsule" aria-label="微信系统菜单示意">
            <MoreHorizontal size={20} />
            <span />
            <CircleHelp size={17} />
          </span>
        </header>
        {page === "ask" && (
          <div className="chat-toolbar">
            <div className="segmented">
              <button
                className={mode === "ask" ? "selected" : ""}
                onClick={() => setMode("ask")}
              >
                提问
              </button>
              <button
                className={mode === "search" ? "selected" : ""}
                onClick={() => setMode("search")}
              >
                搜索
              </button>
            </div>
            <div className="toolbar-actions">
              <Icon label="会话历史" onClick={() => go("history")}>
                <History size={20} />
              </Icon>
              <Icon
                label="新对话"
                onClick={() => {
                  setAnswer("empty");
                  setSearched("");
                  setQuery("");
                }}
              >
                <Plus size={21} />
              </Icon>
            </div>
          </div>
        )}
        {page === "read" && (
          <div className="reader-toolbar">
            <span>{library}</span>
            <Icon label="文档操作" onClick={organize}><MoreHorizontal size={20} /></Icon>
          </div>
        )}
        <div className="content-stage">
          <MobileScroll key={page + mode + (page === "folder" ? library : "")} className="app-body">
            <main className={"page-content page-" + page}>
              {page === "ask" && (
                <>
                  {mode === "search" ? (
                    <>
                      {searched ? (
                        <>
                          <div className="section-heading">
                            <span>“{searched}”的检索结果</span>
                            <small>{hits.length} 篇</small>
                          </div>
                          {rows(hits, true)}
                          {!hits.length && (
                            <div className="empty-state">
                              <h2>没有找到相关资料</h2>
                              <p>试试更短的关键词，或主动切换范围。</p>
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="ask-empty">
                          <h1>搜索资料</h1>
                          <p>输入标题或正文关键词，直接查看原文。</p>
                        </div>
                      )}
                    </>
                  ) : answer === "empty" ? (
                    <>
                      <button
                        className="recent-chat"
                        onClick={() => {
                          restoreConversation("怎样建立知识回顾习惯？");
                        }}
                      >
                        <History size={17} />
                        <span>
                          <small>继续上次会话</small>
                          <strong>怎样建立知识回顾习惯？</strong>
                        </span>
                        <ChevronRight size={16} />
                      </button>
                      <div className="ask-empty ask-examples">
                        <h1>试着问问</h1>
                      </div>
                      <div className="suggestions">
                        {(scope === "全部知识库" || libs.some((l) => l.name === scope)
                          ? [
                              "怎样做一次有产出的每周回顾？",
                              "收集的资料，怎样变成自己的知识？",
                            ]
                          : ["这篇文档有哪些值得行动的建议？", "文中建议怎样安排回顾时间？"]
                        ).map((q) => (
                          <button key={q} onClick={() => send(q)}>
                            <span>{q}</span>
                            <ArrowRight size={16} />
                          </button>
                        ))}
                      </div>
                    </>
                  ) : !evidence.length ? (
                    <div className="empty-state">
                      <h2>这个范围内没有可用资料</h2>
                      <p>当前知识库为空，没有依据可生成回答。</p>
                      <p>更换下方范围后重试。</p>
                    </div>
                  ) : (
                    <>
                      <div className="conversation-scope">
                        <Folder size={14} />
                        <span>{answerScope}</span>
                        <small>仅在此范围回答</small>
                      </div>
                      <h1 className="question">{question}</h1>
                      <div className="answer-heading">
                        <img src={brandMark} alt="mimir" />
                        <strong>来自你的知识库</strong>
                        <span>
                          {answer === "loading"
                            ? "正在整理回答"
                            : answer === "interrupted"
                              ? "生成已中断"
                              : "回答完成"}
                        </span>
                      </div>
                      <div className="answer-prose">
                        <p>{answerText}</p>
                        {(answer === "done" || tick > 2) && (
                          <>
                            <h2>{answerHeading}</h2>
                            <ol>
                              {answerSteps.map((s, i) => (
                                <li key={s}>
                                  <strong>{s.split("|")[0]}</strong>
                                  <br />
                                  {s.split("|")[1]}
                                  <button
                                    className="citation-ref"
                                    aria-label={"查看引用 " + citationNumber(i)}
                                    onClick={() => showCitation(citationNumber(i))}
                                  >
                                    {citationNumber(i)}
                                  </button>
                                </li>
                              ))}
                            </ol>
                          </>
                        )}
                        {answer === "loading" && <span className="stream-cursor" />}
                      </div>
                      {answer === "done" && (
                        <>
                          <button className="sources-row" onClick={() => showCitation(null)}>
                            <FileText size={17} />
                            <strong>查看 {evidence.length} 份参考资料</strong>
                            <ChevronRight size={17} />
                          </button>
                          <div className="answer-actions">
                            <button
                              onClick={() =>
                                navigator.clipboard
                                  .writeText(answerMarkdown)
                                  .then(() => notify("回答已复制"))
                                  .catch(() => notify("请选择文字后复制"))
                              }
                            >
                              <Copy size={16} />
                              复制
                            </button>
                            <button
                              onClick={() =>
                                saved ? read(docs.find((d) => d.id === saved)!) : open("save")
                              }
                            >
                              {saved ? <Check size={16} /> : <Plus size={16} />}
                              {saved ? "查看已存笔记" : "存为笔记"}
                            </button>
                          </div>
                          <p className="answer-disclaimer">回答可能有遗漏，请结合引用原文判断。</p>
                        </>
                      )}
                      {answer === "interrupted" && (
                        <div className="status-banner warning">
                          <WifiOff size={20} />
                          <div>
                            <strong>连接中断，以上为部分内容</strong>
                            <p>尚未生成完整回答。保留当前内容，不自动重复提问。</p>
                            <button
                              onClick={() => {
                                setTick(0);
                                setAnswer("loading");
                              }}
                            >
                              重新提问
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </>
              )}
              {page === "library" && (
                <>
                  <button
                    className="search-entry"
                    onClick={() => {
                      setMode("search");
                      setScope("全部知识库");
                      setAnswer("empty");
                      setSearched("");
                      setQuery("");
                      go("ask");
                    }}
                  >
                    <Search size={19} />
                    搜索全部资料
                  </button>
                  <div className="section-heading">
                    <span>全部知识库</span>
                    <small>3 个</small>
                  </div>
                  {libs.map((l) => (
                    <button
                      className="library-row"
                      key={l.name}
                      onClick={() => {
                        setLibrary(l.name);
                        go("folder");
                      }}
                    >
                      <span className="library-icon">
                        <BookOpen size={20} />
                      </span>
                      <span className="row-copy">
                        <strong>{l.name}</strong>
                        <small>{docs.filter((d) => d.folder === l.name).length} 篇资料</small>
                      </span>
                      <ChevronRight size={18} />
                    </button>
                  ))}
                  <div className="section-heading spaced">
                    <span>最近更新</span>
                  </div>
                  {rows(docs.slice(0, 2))}
                </>
              )}
              {page === "folder" && (
                <>
                  <div className="library-tools">
                    <button
                      className="primary"
                      onClick={() => {
                        edit(true);
                      }}
                    >
                      <Plus size={17} />
                      新建笔记
                    </button>
                    <button
                      className="secondary"
                      onClick={() => {
                        setTarget(library);
                        go("capture");
                      }}
                    >
                      <Link size={17} />
                      链接入库
                    </button>
                    <Icon
                      label="搜索当前库"
                      onClick={() => {
                        setMode("search");
                        setScope(library);
                        setAnswer("empty");
                        setSearched("");
                        setQuery("");
                        go("ask");
                      }}
                    >
                      <Search size={21} />
                    </Icon>
                  </div>
                  <div className="section-heading">
                    <span>
                      全部文档 <small>{docs.filter((d) => d.folder === library).length}</small>
                    </span>
                    <button onClick={() => setFiltered(!filtered)}>
                      <ListFilter size={16} />
                      {filtered ? "方法 ×" : "标签"}
                    </button>
                  </div>
                  {rows(
                    docs.filter(
                      (d) => d.folder === library && (!filtered || d.tags.includes("方法")),
                    ),
                  )}
                  {!docs.some(
                    (d) => d.folder === library && (!filtered || d.tags.includes("方法")),
                  ) && (
                    <div className="empty-state">
                      <h2>{filtered ? "没有这个标签的资料" : "这里还没有资料"}</h2>
                      <p>写下笔记，或收集一篇值得留下的文章。</p>
                    </div>
                  )}
                  <button
                    className="ask-library"
                    onClick={() => {
                      setScope(library);
                      setMode("ask");
                      setAnswer("empty");
                      go("ask");
                    }}
                  >
                    <MessageCircle size={20} />
                    <span>向这个知识库提问</span>
                    <ArrowRight size={17} />
                  </button>
                </>
              )}
              {page === "read" && (
                <>
                  <div className="reading-meta">
                    <span>
                      {doc.kind === "note" ? "Markdown 笔记 · 可编辑" : doc.kind === "pdf" ? "PDF 文档 · 正文只读" : "网页资料 · 正文只读"}
                    </span>
                    <span>今天 10:24 更新</span>
                  </div>
                  <h1 className="document-title">{doc.title}</h1>
                  <div className="tags">
                    {doc.tags.map((t) => (
                      <span key={t}>{t}</span>
                    ))}
                  </div>
                  {kept && draftDoc === id && (newNote || doc.kind === "note") && (
                    <button className="draft-notice" onClick={() => edit()}>
                      {newNote ? "这台手机有未保存的新笔记" : "这台手机有未保存的草稿"}
                      <ArrowRight size={16} />
                    </button>
                  )}
                  {doc.kind === "pdf" && (
                    <div className="file-notice">
                      <File size={22} />
                      <div>
                        <strong>下方为提取正文</strong>
                        <p>查看排版、图片与页码，请打开原件。</p>
                      </div>
                    </div>
                  )}
                  <Markdown text={doc.body} />
                  {doc.kind === "web" && <p className="source-note">收集自网页 · 原始正文只读</p>}
                  <div className="reading-end">已读到这里</div>
                </>
              )}
              {page === "append" && (
                <>
                  <div className="append-target">
                    <FileText size={18} />
                    <span>
                      <strong>{doc.title}</strong>
                      <small>{doc.folder}</small>
                    </span>
                  </div>
                  <div className="append-status">{dirty ? "本机草稿 · 尚未保存" : "追加到笔记末尾"}</div>
                  <KeyboardTextarea
                    className="append-input"
                    aria-label="追加正文"
                    placeholder="补充一个想法…"
                    value={draft}
                    onChange={(e) => {
                      setDraft(e.target.value);
                      setKept(Boolean(e.target.value.trim()));
                    }}
                  />
                </>
              )}
              {page === "edit" && (
                <>
                  <div className="edit-top">
                    <span>
                      {dirty ? <Pencil size={13} /> : <Check size={13} />}
                      {dirty ? "本机草稿 · 尚未保存" : "与已保存版本一致"}
                    </span>
                    <div className="segmented">
                      <button
                        className={!preview ? "selected" : ""}
                        onClick={() => {
                          keyboard.hide();
                          setPreview(false);
                        }}
                      >
                        源文
                      </button>
                      <button
                        className={preview ? "selected" : ""}
                        onClick={() => {
                          keyboard.hide();
                          setPreview(true);
                        }}
                      >
                        预览
                      </button>
                    </div>
                  </div>
                  <KeyboardInput
                    className="title-input"
                    aria-label="笔记标题"
                    placeholder="笔记标题"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                  {preview ? (
                    <Markdown text={draft} />
                  ) : (
                    <KeyboardTextarea
                      className={"source-editor" + (isKeyboardVisible ? " keyboard-open" : "")}
                      aria-label="Markdown 正文"
                      placeholder="写下你的想法…"
                      value={draft}
                      onChange={(e) => {
                        const editor = e.currentTarget;
                        const shortened = editor.value.length < draft.length;
                        setDraft(editor.value);
                        setKept(true);
                        if (shortened) {
                          // A shorter draft must not leave the viewport at the old editor's tail.
                          requestAnimationFrame(() => {
                            if (editor.isConnected && editor.scrollHeight <= 240)
                              editor.closest(".page-edit")?.scrollIntoView({ block: "start" });
                          });
                        }
                      }}
                      spellCheck={false}
                    />
                  )}
                  <p className="editor-end">{draft.length} 字符 · Markdown</p>
                </>
              )}
              {page === "capture" && (
                <>
                  {capture === "done" ? (
                    <div className="capture-success">
                      <span className="success-symbol">
                        <Check size={28} />
                      </span>
                      <h2>资料已入库</h2>
                      <small>已存入「{target}」</small>
                      <button
                        className="primary full"
                        onClick={() => read(docs.find((d) => d.id === "captured") ?? seed[1])}
                      >
                        查看资料
                        <ArrowRight size={17} />
                      </button>
                      <button
                        className="text-button"
                        onClick={() => {
                          setCapture("idle");
                          setUrl("");
                        }}
                      >
                        继续收集
                      </button>
                    </div>
                  ) : (
                    <>
                      <label className="field-label" htmlFor="capture-url">
                        文章链接
                      </label>
                      <KeyboardTextarea
                        id="capture-url"
                        className="url-field"
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        placeholder="https://…"
                        rows={3}
                      />
                      {error && <p className="field-error">{error}</p>}
                      <p className="form-note">支持公开可访问的网页与公众号文章。</p>
                      <label className="field-label">存入位置</label>
                      <button className="folder-field" onClick={() => open("folder")}>
                        <Folder size={19} />
                        <span>{target}</span>
                        <ChevronDown size={17} />
                      </button>
                      {capture === "error" && (
                        <div className="status-banner error">
                          <CircleHelp size={20} />
                          <div>
                            <strong>暂时无法读取这篇文章</strong>
                            <p>
                              文章可能需要微信内访问，或来源暂时不可用。链接与位置已保留，可修改后重试。
                            </p>
                          </div>
                        </div>
                      )}
                      <button
                        className="primary full capture-button"
                        disabled={capture === "loading"}
                        onClick={collect}
                      >
                        {capture === "loading"
                          ? "正在获取资料…"
                          : capture === "error"
                            ? "重试入库"
                            : "收集到知识库"}
                        {capture !== "loading" && <ArrowRight size={17} />}
                      </button>
                      <p className="form-note">部分公众号文章和外链图片可能无法获取。</p>
                    </>
                  )}
                </>
              )}
              {page === "history" && (
                <>
                  <div className="section-heading">今天</div>
                  {["怎样做一次有产出的每周回顾？", "怎样建立知识回顾习惯？"].map((q) => (
                    <button
                      className="history-row"
                      key={q}
                      onClick={() => {
                        restoreConversation(q);
                        go("ask");
                      }}
                    >
                      <MessageCircle size={20} />
                      <span>
                        <strong>{q}</strong>
                        <small>个人知识管理 · 今天 10:30</small>
                      </span>
                      <ChevronRight size={17} />
                    </button>
                  ))}
                </>
              )}
              {page === "mine" && (
                <>
                  <div className="account-heading">
                    <span className="avatar">a</span>
                    <h1>admin</h1>
                    <p>admin@example.com</p>
                  </div>
                  <div className="connection-block">
                    <span>
                      <ShieldCheck size={18} />
                      已连接你的 Mimir
                    </span>
                    <small>固定服务端 · 示例连接</small>
                  </div>
                  <button className="settings-row" onClick={() => go("history")}>
                    <History size={20} />
                    <span>会话历史</span>
                    <ChevronRight size={17} />
                  </button>
                  <button className="settings-row" onClick={() => setDark(!dark)}>
                    <Settings2 size={20} />
                    <span>外观</span>
                    <small>{dark ? "深色" : "浅色"}</small>
                    <ChevronRight size={17} />
                  </button>
                  <button className="settings-row logout" onClick={() => open("logout")}>
                    <LogOut size={20} />
                    <span>退出登录</span>
                  </button>
                </>
              )}
              {page === "login" && (
                <>
                  <div className="login-brand">
                    <h1>登录 Mimir</h1>
                  </div>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      keyboard.hide();
                      if (
                        !["admin", "admin@example.com"].includes(email) ||
                        password !== "12345678"
                      )
                        setError("账号或密码不正确，请检查后重试。");
                      else {
                        go("ask");
                        notify("已进入原型示例账号");
                      }
                    }}
                  >
                    <label className="field-label" htmlFor="email">
                      邮箱或用户名
                    </label>
                    <KeyboardInput
                      id="email"
                      className="form-input"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                    <label className="field-label" htmlFor="password">
                      密码
                    </label>
                    <KeyboardInput
                      id="password"
                      type="password"
                      className="form-input"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                    {error && <p className="field-error">{error}</p>}
                    <button type="submit" className="primary full">
                      登录
                    </button>
                  </form>
                  <p className="login-note">
                    <ShieldCheck size={15} />
                    连接你的固定服务端
                  </p>
                </>
              )}
              {page === "viewer" && (
                <>
                  <div className="viewer-note">
                    <FileText size={21} />
                    <div>
                      <strong>微信原件查看器 · 示意</strong>
                      <p>正式版由微信打开下载后的原件。此处演示返回路径，不模拟真实文件引擎。</p>
                    </div>
                  </div>
                  <div className="paper-preview">
                    <span>个人知识管理实践手册</span>
                    <h1>
                      第三章
                      <br />
                      回顾，让知识生长
                    </h1>
                    <p>回顾的意义不在于重新阅读全部资料，而在于重新看见那些仍然值得思考的问题。</p>
                    <h2>从一个小问题开始</h2>
                    <p>选择本周最有价值的一份资料，写下它改变了什么，再与已有笔记建立联系。</p>
                    <p>让记录从静态的收藏，变成下一次行动的起点。</p>
                    <small>03</small>
                  </div>
                  <p className="viewer-bottom">示例画面 · 不提供原件编辑与引用页定位</p>
                </>
              )}
            </main>
          </MobileScroll>
        </div>
        {page === "ask" && (
          <div className="composer" style={{ bottom: bottomInset + (isKeyboardVisible ? 0 : 61) }}>
            <button className="composer-scope" onClick={() => open("scope")}>
              <Folder size={14} />
              <span>{scope}</span>
              <ChevronDown size={14} />
            </button>
            <div className="composer-input">
              <KeyboardTextarea
                rows={1}
                aria-label={mode === "ask" ? "输入问题" : "输入搜索关键词"}
                placeholder={mode === "ask" ? "向你的知识提问…" : "搜索已入库的资料…"}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    send();
                  }
                }}
              />
              <button
                className="send-button"
                aria-label={
                  answer === "loading" ? "停止生成" : mode === "ask" ? "发送问题" : "执行搜索"
                }
                disabled={answer !== "loading" && !query.trim()}
                onClick={() => (answer === "loading" ? setAnswer("interrupted") : send())}
              >
                {answer === "loading" ? (
                  <Square size={16} fill="currentColor" />
                ) : mode === "ask" ? (
                  <ArrowUp size={20} />
                ) : (
                  <Search size={19} />
                )}
              </button>
            </div>
          </div>
        )}
        {tabs && !isKeyboardVisible && (
          <nav className="tabbar" style={{ bottom: bottomInset }} aria-label="主导航">
            {[
              ["ask", "问答", <MessageCircle size={22} />],
              ["library", "知识库", <BookOpen size={22} />],
              ["mine", "我的", <User size={22} />],
            ].map(([p, label, icon]) => (
              <button
                key={String(p)}
                aria-current={
                  page === p || (page === "folder" && p === "library") ? "page" : undefined
                }
                onClick={() => go(p as Page)}
              >
                {icon}
                <span>{label}</span>
              </button>
            ))}
          </nav>
        )}
        {page === "read" && (
          <div className="reading-toolbar" style={{ bottom: bottomInset }}>
            {doc.kind === "note" ? (
              <button className="reader-edit" onClick={() => edit()}>
                <Pencil size={17} />
                编辑
              </button>
            ) : doc.kind === "pdf" ? (
              <button className="reader-edit" onClick={() => go("viewer")}>
                <File size={17} />
                原件
              </button>
            ) : null}
            <button className="primary" onClick={askDoc}>
              <MessageCircle size={17} />
              问这篇
            </button>
          </div>
        )}
        {(page === "edit" || page === "append") && (
          <div className="edit-toolbar" style={{ bottom: bottomInset }}>
            <button className="secondary" onClick={() => (dirty ? open("leave") : go("read"))}>
              取消
            </button>
            <button className="primary" disabled={!dirty} onClick={() => save()}>
              <Check size={17} />
              {page === "append" ? "保存追加" : "保存"}
            </button>
          </div>
        )}
        {toast && (
          <div className="toast" role="status" style={{ bottom: bottomInset + 100 }}>
            <Check size={17} />
            {toast}
          </div>
        )}
        <BottomSheet
          open={sheet !== ""}
          onOpenChange={(v) => {
            if (!v) setSheet("");
          }}
          title={sheetTitles[sheet] ?? ""}
          snap={
            sheet === "citation" || sheet === "metadata" ? 0.72 : sheet === "conflict" ? 0.66 : 0.56
          }
        >
          <div className={"sheet-app" + (dark ? " dark" : "")}>
            {sheet === "scope" && (
              <>
                <p className="sheet-help">会话范围固定。更换范围会开始新对话。</p>
                {[
                  "全部知识库",
                  ...libs.map((l) => l.name),
                  ...(!libs.some((l) => l.name === scope) && scope !== "全部知识库" ? [scope] : []),
                ].map((s) => (
                  <button
                    className="choice-row"
                    key={s}
                    onClick={() => {
                      if (scope !== s) {
                        setScope(s);
                        setAnswer("empty");
                        setSearched("");
                        notify("已切换范围，开始新对话");
                      }
                      setSheet("");
                    }}
                  >
                    <Folder size={20} />
                    <span>{s}</span>
                    {s === scope && <Check size={18} />}
                  </button>
                ))}
              </>
            )}
            {sheet === "citation" && (
              <>
                <div className="citation-heading">
                  <span>{answerScope}</span>
                  {citation !== null && <button className="text-button" onClick={() => setCitation(null)}>全部来源 <ChevronRight size={15} /></button>}
                </div>
                {evidence.map((d, i) => (citation === null || citation === i + 1) && (
                  <div className={"citation-detail" + (citation !== null ? " focused" : "")} key={d.id}>
                    <div>
                      <span className="source-index">{i + 1}</span>
                      <strong>{d.title}</strong>
                    </div>
                    <p className="citation-identity">{d.kind === "note" ? "Markdown 笔记" : d.kind === "web" ? "网页资料 · 正文只读" : "PDF · 提取正文"} · {d.folder}</p>
                    <blockquote>
                      {d.id === "review"
                        ? "每周五留出 20 分钟，只回顾本周真正用过的资料。"
                        : d.id === "rag"
                          ? "检索范围必须在召回阶段生效。无命中时应明确说明，不扩大范围。"
                          : d.kind === "pdf"
                            ? "将回顾时间固定在每周五的 20 分钟。"
                            : "为每份资料写下一句自己的判断，再链接到正在思考的问题。"}
                    </blockquote>
                    <button className="text-button" onClick={() => {
                      const current = docs.find((item) => item.id === d.id);
                      if (current) read(current);
                      else notify("原文已不存在，引用片段仍保留");
                    }}>
                      打开原文
                      <ArrowRight size={16} />
                    </button>
                  </div>
                ))}
              </>
            )}
            {sheet === "save" && (
              <>
                <p className="sheet-help">保留回答和引用来源，选择存入的知识库。</p>
                {libs.map((l) => (
                  <button className="choice-row" key={l.name} onClick={() => setTarget(l.name)}>
                    <Folder size={19} />
                    <span>{l.name}</span>
                    {target === l.name && <Check size={18} />}
                  </button>
                ))}
                <button
                  className="primary full"
                  onClick={() => {
                    const nid = `answer-${Date.now()}`;
                    setDocs((ds) => [
                      ...ds,
                      {
                        ...seed[0],
                        id: nid,
                        title: question,
                        folder: target,
                        body: answerMarkdown,
                      },
                    ]);
                    setSaved(nid);
                    setSheet("");
                    notify(`已存入「${target}」`);
                  }}
                >
                  确认保存
                  <Check size={17} />
                </button>
              </>
            )}
            {sheet === "actions" && (
              <>
                <button className="choice-row" onClick={() => open("metadata")}>
                  <FileText size={20} />
                  <span>修改标题、标签与目录</span>
                  <ChevronRight size={17} />
                </button>
                {doc.kind === "note" && (
                  <button
                    className="choice-row"
                    onClick={() => edit(false, true)}
                  >
                    <Plus size={20} />
                    <span>追加内容</span>
                    <ChevronRight size={17} />
                  </button>
                )}
                <button className="choice-row" onClick={askDoc}>
                  <MessageCircle size={20} />
                  <span>仅针对这篇文档提问</span>
                  <ChevronRight size={17} />
                </button>
                <button className="secondary full" onClick={() => setSheet("")}>
                  取消
                </button>
              </>
            )}
            {sheet === "metadata" && (
              <>
                <label className="field-label" htmlFor="meta-title">
                  标题
                </label>
                <KeyboardInput
                  id="meta-title"
                  className="form-input"
                  value={metaTitle}
                  onChange={(e) => setMetaTitle(e.target.value)}
                />
                <label className="field-label" htmlFor="meta-tags">
                  标签（逗号分隔）
                </label>
                <KeyboardInput
                  id="meta-tags"
                  className="form-input"
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                />
                <label className="field-label" htmlFor="meta-folder">
                  所在知识库
                </label>
                <select
                  id="meta-folder"
                  className="form-input"
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                >
                  {libs.map((l) => (
                    <option key={l.name}>{l.name}</option>
                  ))}
                </select>
                <p className="form-note">只修改文档信息，正文与原件保持原样。</p>
                <button
                  className="primary full"
                  disabled={!metaTitle.trim()}
                  onClick={() => {
                    setDocs((ds) =>
                      ds.map((d) =>
                        d.id === id
                          ? {
                              ...d,
                              title: metaTitle,
                              tags: tags
                                .split(/[,，]/)
                                .map((t) => t.trim())
                                .filter(Boolean),
                              folder: target,
                            }
                          : d,
                      ),
                    );
                    setLibrary(target);
                    keyboard.hide();
                    setSheet("");
                    notify("文档信息已保存");
                  }}
                >
                  保存修改
                </button>
              </>
            )}
            {sheet === "conflict" && (
              <>
                <div className="status-banner warning">
                  <ShieldCheck size={21} />
                  <div>
                    <strong>你的草稿仍然保留</strong>
                    <p>电脑端在你编辑之后保存了新版本。这次没有写入，避免覆盖新内容。</p>
                  </div>
                </div>
                <div className="version-row">
                  <span>电脑端新版本</span>
                  <strong>今天 10:32</strong>
                </div>
                <div className="version-row">
                  <span>手机草稿</span>
                  <strong>今天 10:35 · {draft.length} 字符</strong>
                </div>
                <button className="primary full" onClick={() => save(true)}>
                  将草稿另存为新笔记
                </button>
                <button
                  className="secondary full"
                  onClick={() => {
                    setKept(true);
                    go("read");
                    notify("已重新读取，手机草稿仍然保留");
                  }}
                >
                  保留草稿，重新读取
                </button>
                <button className="text-button full" onClick={() => setSheet("")}>
                  继续编辑草稿
                </button>
              </>
            )}
            {sheet === "leave" && (
              <>
                <p className="sheet-help">可以把草稿留在这台手机，稍后回来继续。</p>
                <button
                  className="primary full"
                  onClick={() => {
                    setKept(true);
                    go("read");
                    notify("已保留本机草稿");
                  }}
                >
                  保留草稿并离开
                </button>
                <button className="secondary full" onClick={() => setSheet("")}>
                  继续编辑
                </button>
                <button
                  className="text-button full danger"
                  onClick={() => {
                    setKept(false);
                    setConflict(false);
                    setNew(false);
                    setDraftMode("edit");
                    setTitle(doc.title);
                    setBaseline(doc.body);
                    setDraft(doc.body);
                    go("read");
                  }}
                >
                  放弃本次修改
                </button>
              </>
            )}
            {sheet === "folder" &&
              libs.map((l) => (
                <button
                  className="choice-row"
                  key={l.name}
                  onClick={() => {
                    setTarget(l.name);
                    setSheet("");
                  }}
                >
                  <Folder size={20} />
                  <span>{l.name}</span>
                  {target === l.name && <Check size={18} />}
                </button>
              ))}
            {sheet === "logout" && (
              <>
                <p className="sheet-help">
                  {kept
                    ? "当前还有未保存的草稿，请先保存，或主动放弃后退出。"
                    : "退出后需重新登录，当前账号缓存将清理。"}
                </p>
                {kept && (
                  <button className="primary full" onClick={() => {
                    setId(draftDoc);
                    go(draftMode);
                  }}>
                    返回保存草稿
                  </button>
                )}
                <button className="secondary full" onClick={() => setSheet("")}>
                  取消
                </button>
                <button
                  className="text-button full danger"
                  onClick={() => {
                    setKept(false);
                    go("login");
                    notify("已退出原型示例账号");
                  }}
                >
                  {kept ? "放弃草稿并退出" : "确认退出"}
                </button>
              </>
            )}
          </div>
        </BottomSheet>
      </div>
    </>
  );
}
