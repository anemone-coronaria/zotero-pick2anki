import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import {
  formatList, getMessages, getMessagesForLocale, resolveLocale, SUPPORTED_LOCALES,
} from "../src/i18n/index";
import { allDefsHtml } from "../src/modules/dict-html";
import type { DictLookupBundle } from "../src/modules/dict-types";
import { localizeExtraText } from "../src/modules/dict-utils";
import { renderPrefsPane } from "../src/modules/prefs-ui";
import { getSettings } from "../src/modules/settings-store";
import { DEFAULT_SETTINGS } from "../src/modules/settings";
import { parseWeblioHtml } from "../src/modules/weblio-dict";

assert.equal(resolveLocale("en"), "en");
assert.equal(resolveLocale("ja"), "ja");
assert.equal(resolveLocale("zh-Hans"), "zh-Hans");
assert.equal(resolveLocale("system", "en-AU"), "en");
assert.equal(resolveLocale("system", "ja_JP"), "ja");
assert.equal(resolveLocale("system", "zh-CN"), "zh-Hans");
assert.equal(resolveLocale("system", "zh_Hans_SG"), "zh-Hans");
assert.equal(resolveLocale("system", "zh-Hant"), "en");
assert.equal(resolveLocale("system", "fr-FR"), "en");
assert.equal(formatList(["one"], "en"), "one");
assert.match(formatList(["one", "two"], "en"), /one.*two/);

const english = getMessages("en");
assert.equal(getMessages("system").language.english.length > 0, true);

function compareCatalogShape(reference: unknown, candidate: unknown, path = "messages"): void {
  assert.equal(typeof candidate, typeof reference, `${path} has a different value type`);
  if (!reference || typeof reference !== "object") return;
  const expectedKeys = Object.keys(reference as Record<string, unknown>).sort();
  const actualKeys = Object.keys(candidate as Record<string, unknown>).sort();
  assert.deepEqual(actualKeys, expectedKeys, `${path} has different keys`);
  for (const key of expectedKeys) {
    compareCatalogShape(
      (reference as Record<string, unknown>)[key],
      (candidate as Record<string, unknown>)[key],
      `${path}.${key}`,
    );
  }
}

for (const locale of SUPPORTED_LOCALES) {
  const catalog = getMessagesForLocale(locale);
  compareCatalogShape(english, catalog);
  assert.ok(catalog.reader.sectionTitle.length > 0);
  assert.ok(catalog.anki.added("hello", "Vocabulary").includes("hello"));
  assert.ok(catalog.anki.added("hello", "Vocabulary").includes("Vocabulary"));
}

assert.equal(english.reader.lookupButton, "🔍 Look up");
assert.equal(getMessages("ja").reader.lookupButton, "🔍 検索");
assert.equal(getMessages("zh-Hans").reader.lookupButton, "🔍 查词");

const sourceExtra = "词形：runs；ran";
assert.equal(localizeExtraText(sourceExtra, english), "Word forms: runs；ran");
assert.equal(localizeExtraText(sourceExtra, getMessages("ja")), "語形：runs；ran");
assert.equal(localizeExtraText(sourceExtra, getMessages("zh-Hans")), sourceExtra);

assert.equal(DEFAULT_SETTINGS.uiLanguage, "en");
assert.equal(DEFAULT_SETTINGS.cardLabelLanguage, "ui");

const sourceContent = "Meaning <script>alert(1)</script> & source text";
const bundle: DictLookupBundle = {
  word: "sample",
  sources: [
    {
      id: "youdao",
      name: "internal-name",
      url: "https://example.test/one",
      ok: true,
      result: {
        word: "sample",
        definitions: [{ meaning: sourceContent }],
        source: "internal-name",
      },
    },
    {
      id: "bing",
      name: "internal-name-2",
      url: "https://example.test/two",
      ok: true,
      result: {
        word: "sample",
        definitions: [{ meaning: "second definition" }],
        source: "internal-name-2",
      },
    },
  ],
};
const englishCard = allDefsHtml(bundle, getMessages("en"));
const japaneseCard = allDefsHtml(bundle, getMessages("ja"));
assert.ok(englishCard.includes("Meaning &lt;script&gt;alert(1)&lt;/script&gt; &amp; source text"));
assert.ok(japaneseCard.includes("Meaning &lt;script&gt;alert(1)&lt;/script&gt; &amp; source text"));
assert.ok(!englishCard.includes("<script>"));
assert.ok(englishCard.includes("Youdao Dictionary"));
assert.ok(japaneseCard.includes("有道辞書"));

const parserDom = new JSDOM("");
(globalThis as unknown as { DOMParser: unknown }).DOMParser = parserDom.window.DOMParser;
const weblioResult = parseWeblioHtml("hello", `
  <div id="summary">
    <div class="summaryM descriptionWrp"><p>
      <span class="description">意味・対訳</span>
      <span class="content-explanation ej">こんにちは、もしもし</span>
    </p></div>
    <div class="summaryM">
      <span class="element-block"><b>音節</b><span>hel・lo</span></span>
      <span class="element-block"><b>発音記号・読み方</b><span>/həlóʊ, həlˈəʊ/</span></span>
    </div>
    <span class="phoneticEjjeDesc">həlóʊ</span><span>（米国英語）</span>
    <span class="phoneticEjjeDesc">həlˈəʊ</span><span>（英国英語）</span>
    <audio class="contentAudio"><source src="https://cdn.example.test/hello.mp3"></audio>
    <table class="intrst"><tr><td>helloの品詞ごとの意味や使い方</td><td>間投詞としての意味・使い方</td></tr></table>
    <table class="intrst"><tr><td>helloのイディオムやフレーズ</td><td>say hello to</td></tr></table>
    <table class="intrst"><tr><td>helloの学習レベル</td><td>レベル：2</td></tr></table>
  </div>
  <div id="hideDictPrsKENEJ"><div class="Kejje">
    <div class="level0"><div class="KnenjSub">間投詞</div></div>
    <div class="level0"><p class="lvlB">やあ、こんにちは</p></div>
    <table class="KejjeYr"><tr><td><div class="KejjeYrLn">
      <span class="KejjeYrEn">Hello there!</span><span class="KejjeYrJp">こんにちは！</span>
    </div></td></tr></table>
  </div></div>
`);
assert.ok(weblioResult);
assert.equal(weblioResult.definitions[0].meaning, "こんにちは、もしもし");
assert.equal(weblioResult.definitions[1].pos, "interjection");
assert.equal(weblioResult.definitions[1].meaning, "やあ、こんにちは");
assert.equal(weblioResult.definitions[1].example, "Hello there!");
assert.equal(weblioResult.definitions[1].exampleZh, "こんにちは！");
assert.match(weblioResult.phonetic || "", /UK.*həlˈəʊ.*US.*həlóʊ/);
assert.equal(weblioResult.audioUrl, "https://cdn.example.test/hello.mp3");
assert.deepEqual(weblioResult.extras, [
  "音節: hel・lo",
  "helloの品詞ごとの意味や使い方: 間投詞としての意味・使い方",
  "helloのイディオムやフレーズ: say hello to",
  "helloの学習レベル: レベル：2",
]);

const prefs = new Map<string, unknown>();
(globalThis as unknown as { Zotero: unknown }).Zotero = {
  locale: "en-AU",
  debug: () => undefined,
  Prefs: {
    get: (key: string) => prefs.get(key),
    set: (key: string, value: unknown) => { prefs.set(key, value); },
    clear: (key: string) => { prefs.delete(key); },
  },
};
const dom = new JSDOM("<!doctype html><html><body><div id='host'></div></body></html>");
const host = dom.window.document.querySelector("#host") as HTMLElement;
renderPrefsPane(dom.window.document, host);
assert.match(host.textContent || "", /Interface language/);
assert.equal(host.querySelectorAll(".p2a-src-list").length, 1);
assert.equal(host.querySelectorAll(".p2a-src-list .p2a-src-row").length, 6);
const firstDictionaryToggle = host.querySelector(".p2a-src-row input[type='checkbox']") as HTMLInputElement;
firstDictionaryToggle.checked = false;
firstDictionaryToggle.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
assert.equal(getSettings().onlineDictSources.length, 5);
assert.equal(host.querySelectorAll(".p2a-src-list .p2a-src-row").length, 6);
assert.equal(host.querySelectorAll(".p2a-src-list .p2a-src-row input:not(:checked)").length, 1);
assert.ok(!(host.textContent || "").includes("Disabled dictionaries"));
const disabledDictionaryToggle = host.querySelector(
  ".p2a-src-list .p2a-src-row input:not(:checked)",
) as HTMLInputElement;
disabledDictionaryToggle.checked = true;
disabledDictionaryToggle.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
assert.equal(getSettings().onlineDictSources.at(-1), "youdao");
assert.equal(host.querySelector(".p2a-src-list .p2a-src-row:last-child")?.getAttribute("data-src"), "youdao");
const importBox = Array.from(host.querySelectorAll("textarea")).find((node) => !node.hasAttribute("readonly"));
assert.ok(importBox);
importBox.value = "draft settings";
importBox.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
const languageSelect = host.querySelector("select") as HTMLSelectElement;
languageSelect.value = "ja";
languageSelect.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
assert.equal(getSettings().uiLanguage, "ja");
assert.match(host.textContent || "", /表示言語/);
const rerenderedImportBox = Array.from(host.querySelectorAll("textarea")).find((node) => !node.hasAttribute("readonly"));
assert.equal(rerenderedImportBox?.value, "draft settings");

console.log(`Verified ${SUPPORTED_LOCALES.length} complete UI catalogs and locale fallback behavior.`);
