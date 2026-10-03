// ============ 设置面板（Zotero 偏好面板 UI） ============
// 与 Obsidian 版 Pick2ankiSettingTab 一一对应：分组、名称、说明文字、下拉/开关/拖拽排序全部对齐，
// 便于用户在两版之间迁移。差异只在宿主控件上：Obsidian 的 Setting/PluginSettingTab → 手写 HTML 控件。
//
// 运行位置：Zotero 偏好窗口（chrome 特权文档），由 addon/content/preferences.xhtml 的 onload
// 调用 Zotero.<addonInstance>.api.renderPrefs(document, this)。
//
// v1.0.1 修复（用户反馈「点测试连接后设置界面会消失」）：
//   1) 面板内【不再使用】Zotero 的系统进度窗口（ProgressWindow）——那个浮窗是挂在主窗口上的，
//      弹出时会抢走焦点，偏好窗口就跑到主窗口后面，看起来像"被关掉了"。所有提示改为面板内联状态文字。
//   2) 异步操作完成后【不再整体重建面板】，只重建受影响的分区（拖拽排序只重建词典列表，
//      连接 Anki 只重建 Anki 分区），保持 Zotero 偏好窗口自身的 DOM 稳定。
//   3) 所有异步回调都包了 try/catch，异常只显示在状态行里，不会冒泡到偏好窗口。
import type { AnkiFieldSource, OnlineDictSource, Pick2ankiSettings } from "./settings";
import {
  ANKI_FIELD_SOURCES, ONLINE_DICT_SOURCES,
} from "./settings";
import {
  exportSettingsJson, getSettings, importSettingsJson, resetSettings, setSetting,
} from "./settings-store";
import { dictHasContent, dictSourceErrorText, lookupWordOnline } from "./online-dict";
import type { DictLookupBundle } from "./online-dict";
import {
  addWordCard, ankiVersion, fetchAnkiDecks, fetchAnkiModelFields, fetchAnkiModels,
} from "./anki";
import { div, el, empty, span } from "./zdom";
import { log } from "./env";
import { formatList, getMessages, LOCALE_NATIVE_NAMES } from "../i18n";
import type { CardLabelLanguage, LanguagePreference, Messages } from "../i18n";

/** 端到端自测用的词。
 *  首选「hippopotomonstrosesquippedaliophobia」（长词恐惧症，34 个字母）：既走通完整链路，
 *  又顺带压测超长单词的排版换行、音频文件名截断。
 *  注意：这个玩笑词所有词典源都没有释义（有道只给维基摘要、必应是"无结果"页），
 *  所以自测会自动回退到 FALLBACK_TEST_WORD 继续，避免用户点了按钮只看到"查不到"。 */
const SELF_TEST_WORD = "hippopotomonstrosesquippedaliophobia";
/** 超长词查不到时用于完成自测的常用词 */
const FALLBACK_TEST_WORD = "hello";

/** 面板运行时状态（Anki 元数据缓存，与 Obsidian 版插件实例上的缓存等价） */
interface PaneState {
  decks: string[];
  models: string[];
  fields: string[];
  fieldsModel: string;
  error: string;
  metaUrl: string;
  busy: boolean;
}

const state: PaneState = {
  decks: [], models: [], fields: [], fieldsModel: "", error: "", metaUrl: "", busy: false,
};

// 面板 DOM 引用（分区容器常驻，异步操作后只重建对应分区）
let paneDoc: Document | null = null;
let topStatus: HTMLElement | null = null;
let languageHost: HTMLElement | null = null;
let dictHost: HTMLElement | null = null;
let ankiHost: HTMLElement | null = null;
let triggerHost: HTMLElement | null = null;
let migrationHost: HTMLElement | null = null;
let importDraft = "";

function messages(settings = getSettings()): Messages {
  return getMessages(settings.uiLanguage);
}

/** 渲染设置面板（幂等：首次建立骨架与分区容器，之后只重建各分区内容） */
export function renderPrefsPane(doc: Document, host: HTMLElement): void {
  paneDoc = doc;
  host.classList.add("zopick2anki-prefs");

  if (!host.querySelector(".zp-skeleton")) {
    empty(host);
    host.appendChild(heading(doc, "Pick2anki"));
    topStatus = div(doc, "zp-status zp-top");
    host.appendChild(topStatus);
    const sk = div(doc, "zp-skeleton");
    host.appendChild(sk);
    languageHost = div(doc, "zp-section");
    dictHost = div(doc, "zp-section");
    ankiHost = div(doc, "zp-section");
    triggerHost = div(doc, "zp-section");
    migrationHost = div(doc, "zp-section");
    sk.appendChild(languageHost);
    sk.appendChild(dictHost);
    sk.appendChild(ankiHost);
    sk.appendChild(triggerHost);
    sk.appendChild(migrationHost);
  }
  rerenderAll();
}

function rerenderAll(): void {
  rerenderLanguage();
  rerenderDict();
  rerenderAnki();
  rerenderTrigger();
  rerenderMigration();
}

function rerenderLanguage(): void {
  if (!paneDoc || !languageHost) return;
  empty(languageHost);
  renderLanguageSection(paneDoc, languageHost, getSettings());
}

/** 只重建词典分区（拖拽排序/启停后调用） */
function rerenderDict(): void {
  if (!paneDoc || !dictHost) return;
  empty(dictHost);
  try { renderDictSection(paneDoc, dictHost, getSettings()); }
  catch (e) { setStatus(messages().common.operationFailed(errText(e)), false); }
}

/** 只重建 Anki 分区（连接/切模板后调用） */
function rerenderAnki(): void {
  if (!paneDoc || !ankiHost) return;
  empty(ankiHost);
  try { renderAnkiSection(paneDoc, ankiHost, getSettings()); }
  catch (e) { setStatus(messages().common.operationFailed(errText(e)), false); }
}

function rerenderTrigger(): void {
  if (!paneDoc || !triggerHost) return;
  empty(triggerHost);
  renderTriggerSection(paneDoc, triggerHost, getSettings());
}

function rerenderMigration(): void {
  if (!paneDoc || !migrationHost) return;
  empty(migrationHost);
  renderMigrationSection(paneDoc, migrationHost, getSettings());
}

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** 面板顶部状态行（替代系统进度窗口：不弹浮窗、不抢焦点） */
function setStatus(text: string, ok?: boolean): void {
  log("[settings] " + text);
  if (!topStatus) return;
  topStatus.textContent = text;
  topStatus.className = "zp-status zp-top" + (ok === undefined ? "" : ok ? " zp-ok" : " zp-err");
}

// ---------- 通用控件 ----------
function heading(doc: Document, text: string): HTMLElement {
  return el(doc, "h2", { text });
}

function row(doc: Document, name: string, desc?: string): HTMLElement {
  const wrap = div(doc, "zp-row");
  wrap.appendChild(el(doc, "label", { cls: "zp-name", text: name }));
  const body = div(doc, "zp-body");
  wrap.appendChild(body);
  if (desc) body.appendChild(div(doc, "zp-desc", desc));
  return wrap;
}

function addRow(host: HTMLElement, name: string, desc?: string): HTMLElement {
  const doc = paneDoc ?? host.ownerDocument;
  if (!doc) throw new Error("The settings panel document is unavailable.");
  const r = row(doc, name, desc);
  host.appendChild(r);
  return r.querySelector(".zp-body") as HTMLElement;
}

function checkbox(doc: Document, checked: boolean, onChange: (v: boolean) => void): HTMLInputElement {
  const input = el(doc, "input", { attr: { type: "checkbox" } });
  input.checked = checked;
  input.addEventListener("change", () => onChange(input.checked));
  return input;
}

function select(doc: Document, options: Array<[string, string]>, value: string, onChange: (v: string) => void): HTMLSelectElement {
  const sel = el(doc, "select");
  for (const [v, label] of options) {
    sel.appendChild(el(doc, "option", { text: label, attr: { value: v } }));
  }
  sel.value = value;
  sel.addEventListener("change", () => onChange(sel.value));
  return sel;
}

function button(doc: Document, text: string, onClick: () => void, primary = false): HTMLButtonElement {
  const b = el(doc, "button", { cls: primary ? "zp-primary" : undefined, text });
  b.addEventListener("click", () => {
    // 所有按钮回调统一兜底，异常只写进状态行
    try { onClick(); } catch (e) { setStatus(messages().common.operationFailed(errText(e)), false); }
  });
  return b;
}

/** 异步按钮：运行期间禁用按钮，异常写状态行（v1.0.1：不再整体重建面板） */
function asyncButton(
  doc: Document,
  text: string,
  run: () => Promise<void>,
  primary = false,
): HTMLButtonElement {
  const b = el(doc, "button", { cls: primary ? "zp-primary" : undefined, text });
  b.addEventListener("click", () => {
    if (b.disabled) return;
    const operationMessages = messages();
    b.disabled = true;
    const original = b.textContent;
    b.textContent = operationMessages.common.processing;
    void (async () => {
      try {
        await run();
      } catch (e) {
        setStatus(operationMessages.common.operationFailed(errText(e)), false);
      } finally {
        b.disabled = false;
        b.textContent = original;
      }
    })();
  });
  return b;
}

function textInput(doc: Document, value: string, placeholder: string, onChange: (v: string) => void): HTMLInputElement {
  const input = el(doc, "input", { attr: { type: "text", placeholder } });
  input.value = value;
  input.addEventListener("change", () => onChange(input.value));
  return input;
}

// ---------- Interface language ----------
function renderLanguageSection(doc: Document, host: HTMLElement, s: Pick2ankiSettings): void {
  const m = getMessages(s.uiLanguage);
  const body = addRow(host, m.language.label, m.language.description);
  body.appendChild(select(doc, [
    ["en", LOCALE_NATIVE_NAMES.en],
    ["ja", LOCALE_NATIVE_NAMES.ja],
    ["zh-Hans", LOCALE_NATIVE_NAMES["zh-Hans"]],
    ["system", m.language.system],
  ], s.uiLanguage, (value) => {
    setSetting("uiLanguage", value as LanguagePreference);
    rerenderAll();
  }));

  const cardBody = addRow(host, m.language.cardLabel, m.language.cardLabelDescription);
  cardBody.appendChild(select(doc, [
    ["ui", m.language.followInterface],
    ["en", LOCALE_NATIVE_NAMES.en],
    ["ja", LOCALE_NATIVE_NAMES.ja],
    ["zh-Hans", LOCALE_NATIVE_NAMES["zh-Hans"]],
  ], s.cardLabelLanguage, (value) => {
    setSetting("cardLabelLanguage", value as CardLabelLanguage);
  }));
}

// ---------- 1. 在线词典 ----------
function renderDictSection(doc: Document, host: HTMLElement, s: Pick2ankiSettings): void {
  const m = getMessages(s.uiLanguage);
  host.appendChild(heading(doc, m.dictionaries.sectionTitle));
  addRow(host, m.dictionaries.introductionLabel, m.dictionaries.introduction);

  const body = addRow(host, m.dictionaries.orderLabel, m.dictionaries.orderDescription);
  const list = div(doc, "p2a-src-list");
  const active: OnlineDictSource[] = [...(s.onlineDictSources || [])];
  const disabled = ONLINE_DICT_SOURCES.filter((x) => !active.includes(x));
  let dragId: string | null = null;

  for (const src of [...active, ...disabled]) {
    const isActive = active.includes(src);
    const r = div(doc, "p2a-src-row");
    r.draggable = isActive;
    r.dataset.src = src;
    r.appendChild(span(doc, `p2a-src-grip${isActive ? "" : " p2a-src-grip-disabled"}`, "⠿"));
    r.appendChild(span(doc, "p2a-src-name", m.dictionaries.names[src]));
    r.appendChild(checkbox(doc, isActive, (enabled) => {
      const current = getSettings().onlineDictSources || [];
      setSetting("onlineDictSources", enabled
        ? (current.includes(src) ? current : [...current, src])
        : current.filter((x) => x !== src));
      rerenderDict();
    }));

    if (isActive) {
      r.addEventListener("dragstart", (e) => {
        dragId = src;
        if (e.dataTransfer) { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", src); }
        r.classList.add("p2a-src-dragging");
      });
      r.addEventListener("dragend", () => {
        dragId = null;
        r.classList.remove("p2a-src-dragging");
        for (const other of Array.from(list.querySelectorAll(".p2a-src-row"))) other.classList.remove("p2a-src-drag-over");
      });
      r.addEventListener("dragover", (e) => {
        if (!dragId || dragId === (r.dataset.src || "")) return;
        e.preventDefault();
        r.classList.add("p2a-src-drag-over");
      });
      r.addEventListener("dragleave", () => r.classList.remove("p2a-src-drag-over"));
      r.addEventListener("drop", (e) => {
        e.preventDefault();
        r.classList.remove("p2a-src-drag-over");
        const from = dragId;
        const to = r.dataset.src || "";
        if (!from || from === to) return;
        const list2 = [...(getSettings().onlineDictSources || [])];
        const fi = list2.indexOf(from as OnlineDictSource);
        const ti = list2.indexOf(to as OnlineDictSource);
        if (fi >= 0 && ti >= 0 && fi !== ti) {
          list2.splice(ti, 0, list2.splice(fi, 1)[0]);
          setSetting("onlineDictSources", list2);
          rerenderDict();
        }
      });
    }
    list.appendChild(r);
  }
  body.appendChild(list);

  const testBody = addRow(host, m.dictionaries.testLabel, m.dictionaries.testDescription);
  const testOut = div(doc, "zp-status");
  testBody.appendChild(asyncButton(doc, m.dictionaries.testButton, async () => {
    const operationMessages = messages();
    setStatus(operationMessages.dictionaries.testing);
    const bundle = await lookupWordOnline("hello", getSettings().onlineDictSources);
    const lines = bundle.sources.map((x) => operationMessages.dictionaries.sourceResult(
      operationMessages.dictionaries.names[x.id], x.ok, dictSourceErrorText(x, operationMessages),
    ));
    testOut.textContent = lines.join("\n");
    testOut.className = "zp-status " + (dictHasContent(bundle) ? "zp-ok" : "zp-err");
    setStatus(dictHasContent(bundle) ? operationMessages.dictionaries.testComplete : operationMessages.dictionaries.testFailed, dictHasContent(bundle));
  }));
  testBody.appendChild(testOut);
}

// ---------- 2. Anki 写卡 ----------
function renderAnkiSection(doc: Document, host: HTMLElement, s: Pick2ankiSettings): void {
  const m = getMessages(s.uiLanguage);
  host.appendChild(heading(doc, m.anki.sectionTitle));

  const enableBody = addRow(host, m.anki.enabledLabel, m.anki.enabledDescription);
  enableBody.appendChild(checkbox(doc, s.ankiEnabled, (v) => {
    setSetting("ankiEnabled", v);
    rerenderAnki();
  }));

  if (!s.ankiEnabled) return;

  const urlBody = addRow(host, m.anki.urlLabel, m.anki.urlDescription);
  urlBody.appendChild(textInput(doc, s.ankiConnectUrl, "http://127.0.0.1:8765", (v) => {
    setSetting("ankiConnectUrl", v.trim() || "http://127.0.0.1:8765");
    state.metaUrl = "";
  }));

  const connBody = addRow(host, m.anki.metadataLabel, state.decks.length > 0
    ? m.anki.metadataConnected(state.decks.length, state.models.length)
    : m.anki.metadataDisconnected);
  connBody.appendChild(asyncButton(doc, m.anki.connectButton, async () => {
    const operationMessages = messages();
    setStatus(operationMessages.anki.connecting);
    await refreshAnkiMeta(true);
    if (state.error) {
      setStatus(operationMessages.anki.connectionFailed(state.error), false);
    } else {
      const cur = getSettings();
      if (!cur.ankiDeck && state.decks.length > 0) setSetting("ankiDeck", state.decks[0]);
      if (!cur.ankiNoteType && state.models.length > 0) {
        setSetting("ankiNoteType", state.models[0]);
        await loadTemplateFields(state.models[0]);
      }
      setStatus(operationMessages.anki.connected(state.decks.length, state.models.length), true);
    }
    rerenderAnki(); // 只重建 Anki 分区（不动偏好窗口的其他部分）
  }, true));
  if (state.error) addRow(host, m.anki.connectionStatus, "⚠️ " + state.error);

  // 目标牌组
  if (state.decks.length > 0) {
    const chosen = s.ankiDeck && state.decks.includes(s.ankiDeck) ? s.ankiDeck : state.decks[0];
    const b = addRow(host, m.anki.deckLabel, m.anki.deckDescription);
    b.appendChild(select(doc, state.decks.map((d) => [d, d] as [string, string]), chosen, (v) => {
      setSetting("ankiDeck", v);
    }));
  } else {
    addRow(host, m.anki.deckLabel, m.anki.deckUnavailable);
  }

  // 目标模板
  let chosenModel = "";
  if (state.models.length > 0) {
    chosenModel = s.ankiNoteType && state.models.includes(s.ankiNoteType) ? s.ankiNoteType : state.models[0];
    const b = addRow(host, m.anki.modelLabel, m.anki.modelDescription);
    b.appendChild(select(doc, state.models.map((m) => [m, m] as [string, string]), chosenModel, (v) => {
      void (async () => {
        const operationMessages = messages();
        try {
          setSetting("ankiNoteType", v);
          setStatus(operationMessages.anki.loadingFields);
          await loadTemplateFields(v);
          if (state.error) setStatus(operationMessages.anki.fieldsFailed(state.error), false);
          else setStatus(operationMessages.anki.fieldsLoaded(v, state.fields.length), true);
        } catch (e) {
          setStatus(operationMessages.anki.modelChangedFailed(errText(e)), false);
        } finally {
          rerenderAnki();
        }
      })();
    }));
    const fb = addRow(host, m.anki.refreshFieldsLabel, m.anki.refreshFieldsDescription);
    fb.appendChild(asyncButton(doc, m.anki.refreshFieldsButton, async () => {
      const operationSettings = getSettings();
      const operationMessages = getMessages(operationSettings.uiLanguage);
      const m = operationSettings.ankiNoteType || chosenModel;
      if (!m) { setStatus(operationMessages.anki.chooseModelFirst, false); return; }
      setStatus(operationMessages.anki.loadingFields);
      await loadTemplateFields(m);
      if (state.error) setStatus(operationMessages.anki.fieldsFailed(state.error), false);
      else setStatus(operationMessages.anki.fieldsLoaded(
        m, state.fields.length, formatList(state.fields, operationSettings.uiLanguage),
      ), true);
      rerenderAnki();
    }));
  } else {
    addRow(host, m.anki.modelLabel, m.anki.modelUnavailable);
  }

  // 自动读取当前目标模板的字段（与 Obsidian 版一样只在缓存不匹配时触发一次）
  const model = s.ankiNoteType && state.models.includes(s.ankiNoteType) ? s.ankiNoteType : (state.models[0] || "");
  if (model && state.fieldsModel !== model && !state.busy) {
    const operationMessages = m;
    state.busy = true;
    void loadTemplateFields(model)
      .then(() => { state.busy = false; rerenderAnki(); })
      .catch((e) => { state.busy = false; setStatus(operationMessages.anki.autoFieldsFailed(errText(e)), false); });
  }

  // 字段映射
  host.appendChild(heading(doc, m.anki.fieldMappingTitle));
  const fieldsLoaded = model !== "" && state.fieldsModel === model;
  addRow(host, m.anki.mappingMethodLabel, fieldsLoaded
    ? m.anki.mappingReady(state.fieldsModel)
    : m.anki.mappingUnavailable);

  if (state.fields.length > 0) {
    const grid = div(doc, "zp-field-map");
    for (const src of ANKI_FIELD_SOURCES) {
      // 上下堆叠：内容源名称 → 字段下拉 → 说明（与其它设置项同一套版式）
      const fieldRow = div(doc, "zp-field-row");
      fieldRow.appendChild(div(doc, "zp-fm-label", m.fields.labels[src]));
      const cur = (s.ankiFieldMap?.[src] || "").trim();
      const options: Array<[string, string]> = [["", m.common.doNotInclude], ...state.fields.map((f) => [f, f] as [string, string])];
      if (cur && !state.fields.includes(cur)) options.push([cur, `${cur} (${m.common.currentFieldMissing})`]);
      fieldRow.appendChild(select(doc, options, cur, (v) => {
        const map = { ...(getSettings().ankiFieldMap || {}) };
        map[src] = v.trim();
        setSetting("ankiFieldMap", map);
        setStatus(m.anki.fieldStatus(m.fields.labels[src], v), true);
      }));
      fieldRow.appendChild(div(doc, "zp-fm-desc", `${m.fields.descriptions[src]} (${m.fields.placeholders[src]})`));
      grid.appendChild(fieldRow);
    }
    host.appendChild(grid);
  } else {
    addRow(host, m.anki.currentFieldsLabel, m.anki.currentFieldsUnavailable);
  }

  // 写卡行为
  const autoBody = addRow(host, m.anki.autoAddLabel, m.anki.autoAddDescription);
  autoBody.appendChild(checkbox(doc, s.ankiAutoAdd, (v) => setSetting("ankiAutoAdd", v)));

  const dupBody = addRow(host, m.anki.duplicateLabel);
  dupBody.appendChild(select(doc, [["skip", m.anki.duplicateSkip], ["add", m.anki.duplicateAdd]], s.ankiDup, (v) => {
    setSetting("ankiDup", v as "skip" | "add");
  }));

  const scopeBody = addRow(host, m.anki.duplicateScopeLabel);
  scopeBody.appendChild(select(doc, [["deck", m.anki.duplicateScopeDeck], ["model", m.anki.duplicateScopeModel]], s.ankiDupScope, (v) => {
    setSetting("ankiDupScope", v as "deck" | "model");
  }));

  const tagBody = addRow(host, m.anki.tagsLabel, m.anki.tagsDescription);
  tagBody.appendChild(textInput(doc, s.ankiTags, m.anki.tagsPlaceholder, (v) => setSetting("ankiTags", v)));

  const edgeBody = addRow(host, m.anki.edgeTtsLabel, m.anki.edgeTtsDescription);
  edgeBody.appendChild(checkbox(doc, s.edgeTtsFallback, (v) => setSetting("edgeTtsFallback", v)));

  // 端到端自测：真实查词 + 真实写卡（结果只显示在面板内）
  const selfBody = addRow(host, m.anki.selfTestLabel, m.anki.selfTestDescription(SELF_TEST_WORD, FALLBACK_TEST_WORD));
  const selfOut = div(doc, "zp-status");
  selfBody.appendChild(asyncButton(doc, m.anki.selfTestButton, async () => {
    const settings = getSettings();
    const operationMessages = getMessages(settings.uiLanguage);
    setStatus(operationMessages.anki.lookingUp(SELF_TEST_WORD));
    let word = SELF_TEST_WORD;
    let bundle = await lookupWordOnline(word, settings.onlineDictSources);
    let note = "";
    if (!dictHasContent(bundle)) {
      // 意料之中：这个玩笑词没有词典释义。改用常用词继续，保证按钮在任何网络环境下都能完成自测。
      note = operationMessages.anki.fallbackNotice(SELF_TEST_WORD, FALLBACK_TEST_WORD);
      infoDictFailure(bundle, operationMessages);
      word = FALLBACK_TEST_WORD;
      setStatus(operationMessages.anki.lookingUp(word));
      bundle = await lookupWordOnline(word, settings.onlineDictSources);
    }
    if (!dictHasContent(bundle)) {
      selfOut.textContent = operationMessages.anki.selfTestNoResult(word);
      selfOut.className = "zp-status zp-err";
      setStatus(operationMessages.anki.selfTestStopped, false);
      return;
    }
    const res = await addWordCard(settings, {
      word,
      contextSentence: operationMessages.anki.selfTestContext(word),
      cite: operationMessages.anki.selfTestCitation,
      bundle,
    }, undefined, (stage) => setStatus(operationMessages.anki.selfTestProgress(stage)));
    selfOut.textContent = (res.ok ? "✅ " : "❌ ") + res.message + note;
    selfOut.className = "zp-status " + (res.ok ? "zp-ok" : "zp-err");
    setStatus(res.ok ? operationMessages.anki.selfTestPassed(word) : operationMessages.anki.selfTestFailed, res.ok);
  }));
  selfBody.appendChild(selfOut);
}

/** 把某个词在各源的失败原因写到状态行（诊断"词没收录"还是"网络不通"） */
function infoDictFailure(
  bundle: DictLookupBundle,
  m = messages(),
): void {
  const lines = bundle.sources.map((s) => m.dictionaries.sourceResult(
    m.dictionaries.names[s.id], s.ok, dictSourceErrorText(s, m),
  ));
  setStatus(lines.join("\n"), false);
}

/** 拉取 Anki 牌组/模板元数据（与 Obsidian 版 refreshAnkiMeta 同逻辑） */
async function refreshAnkiMeta(force = false): Promise<void> {
  const s = getSettings();
  if (!s.ankiConnectUrl) return;
  if (!force && state.metaUrl === s.ankiConnectUrl && (state.decks.length > 0 || state.models.length > 0)) return;
  state.metaUrl = s.ankiConnectUrl;
  state.error = "";
  try {
    await ankiVersion(s.ankiConnectUrl, s.uiLanguage);
    const [decks, models] = await Promise.all([fetchAnkiDecks(s), fetchAnkiModels(s)]);
    state.decks = decks;
    state.models = models;
  } catch (e) {
    state.error = errText(e);
    state.decks = [];
    state.models = [];
    log("Failed to load Anki metadata: " + state.error);
  }
}

/** 读取指定模板的字段列表（供字段映射下拉用） */
async function loadTemplateFields(model: string): Promise<void> {
  state.fieldsModel = model;
  state.fields = [];
  state.error = "";
  if (!model || !getSettings().ankiConnectUrl) return;
  try {
    state.fields = await fetchAnkiModelFields(getSettings(), model);
  } catch (e) {
    state.error = errText(e);
    state.fields = [];
  }
}

// ---------- 3. 触发与 Zotero 专属项 ----------
function renderTriggerSection(doc: Document, host: HTMLElement, s: Pick2ankiSettings): void {
  const m = getMessages(s.uiLanguage);
  host.appendChild(heading(doc, m.trigger.sectionTitle));
  const modeBody = addRow(host, m.trigger.modeLabel, m.trigger.modeDescription);
  modeBody.appendChild(select(doc, [["direct", m.trigger.direct], ["ctrl", m.trigger.manual]], s.triggerMode, (v) => {
    setSetting("triggerMode", v as "direct" | "ctrl");
  }));

  const wBody = addRow(host, m.trigger.widthLabel, m.trigger.widthDescription);
  wBody.appendChild(textInput(doc, String(s.popupWidth), "400", (v) => {
    const n = Number(v);
    if (Number.isFinite(n) && n >= 240 && n <= 720) {
      setSetting("popupWidth", Math.round(n));
      setStatus(m.trigger.widthSet(Math.round(n)), true);
    } else {
      setStatus(m.trigger.widthInvalid, false);
    }
  }));

  const hBody = addRow(host, m.trigger.heightLabel, m.trigger.heightDescription);
  hBody.appendChild(textInput(doc, String(s.popupMaxHeight), "260", (v) => {
    const n = Number(v);
    if (Number.isFinite(n) && n >= 120) {
      setSetting("popupMaxHeight", Math.round(n));
      setStatus(m.trigger.heightSet(Math.round(n)), true);
    } else {
      setStatus(m.trigger.heightInvalid, false);
    }
  }));

  const expandBody = addRow(host, m.trigger.sentenceExpandLabel, m.trigger.sentenceExpandDescription);
  expandBody.appendChild(checkbox(doc, s.sentenceExpand, (v) => setSetting("sentenceExpand", v)));

  const citeBody = addRow(host, m.trigger.citeLabel, m.trigger.citeDescription);
  citeBody.appendChild(checkbox(doc, s.showCite, (v) => setSetting("showCite", v)));
}

// ---------- 4. 迁移 / 备份 ----------
function renderMigrationSection(doc: Document, host: HTMLElement, s: Pick2ankiSettings): void {
  const m = getMessages(s.uiLanguage);
  host.appendChild(heading(doc, m.migration.sectionTitle));
  addRow(host, m.migration.introductionLabel, m.migration.introduction);

  const outBody = addRow(host, m.migration.exportLabel, m.migration.exportDescription);
  const ta = el(doc, "textarea", { attr: { readonly: "readonly" } });
  ta.value = exportSettingsJson();
  outBody.appendChild(ta);

  const inBody = addRow(host, m.migration.importLabel, m.migration.importDescription);
  const input = el(doc, "textarea", { attr: { placeholder: "{ \"onlineDictSources\": [\"youdao\"], ... }" } });
  input.value = importDraft;
  input.addEventListener("input", () => { importDraft = input.value; });
  inBody.appendChild(input);
  const status = div(doc, "zp-status");
  const btns = div(doc, "zp-btn-bar");
  btns.appendChild(button(doc, m.common.importAction, () => {
    const res = importSettingsJson(input.value);
    status.textContent = (res.ok ? "✅ " : "❌ ") + res.message;
    status.className = "zp-status " + (res.ok ? "zp-ok" : "zp-err");
    setStatus(res.message, res.ok);
    if (res.ok) rerenderAll();
  }, true));
  btns.appendChild(button(doc, m.common.restoreDefaults, () => {
    if (!confirmDialog(doc, m.migration.confirmReset)) return;
    const defaults = resetSettings();
    const names = formatList(defaults.onlineDictSources.map((id) => m.dictionaries.names[id]), s.uiLanguage);
    status.textContent = `✅ ${m.migration.resetComplete(names)}`;
    status.className = "zp-status zp-ok";
    setStatus(m.migration.resetComplete(names), true);
    rerenderAll();
  }));
  inBody.appendChild(btns);
  inBody.appendChild(status);
}

/** 简单确认框（偏好窗口里优先用 window.confirm，失败则默认继续） */
function confirmDialog(doc: Document, message: string): boolean {
  try {
    const win = doc.defaultView as unknown as { confirm?: (m: string) => boolean } | null;
    if (win?.confirm) return win.confirm(message);
  } catch { /* 忽略 */ }
  return true;
}
