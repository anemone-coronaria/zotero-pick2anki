// Weblio English–Japanese dictionary adapter (HTML, best-effort parsing).
import type { DictAdapter, DictDefinition, DictExample, DictResult } from "./dict-types";
import { ONLINE_DICT_NAMES } from "./settings";
import { absUrl, clean, fetchText, joinPhonetic, parseHtml } from "./dict-utils";

const entryUrl = (word: string) => {
  const query = encodeURIComponent(word.trim()).replace(/%20/g, "+");
  return `https://ejje.weblio.jp/content/${query}`;
};

export const weblioAdapter: DictAdapter = {
  id: "weblio",
  name: ONLINE_DICT_NAMES.weblio,
  sourceUrlFor: entryUrl,
  async lookup(word) {
    try {
      return parseWeblioHtml(word, await fetchText(entryUrl(word)));
    } catch (e) {
      console.warn("[pick2anki] Weblio lookup failed:", word, e instanceof Error ? e.message : String(e));
      return null;
    }
  },
};

function normalizedPos(value: string): string | undefined {
  if (/間投詞|感嘆詞/.test(value)) return "interjection";
  if (/名詞/.test(value)) return "noun";
  if (/動詞/.test(value)) return "verb";
  if (/形容詞/.test(value)) return "adjective";
  if (/副詞/.test(value)) return "adverb";
  if (/代名詞|代詞/.test(value)) return "pronoun";
  if (/前置詞|前置词|介詞/.test(value)) return "preposition";
  if (/接続詞|接续词|連詞/.test(value)) return "conjunction";
  return clean(value) || undefined;
}

function exampleAfter(block: Element): DictExample | null {
  let next = block.nextElementSibling;
  for (let i = 0; next && i < 3; i++, next = next.nextElementSibling) {
    if (next.classList.contains("level0")) return null;
    const line = next.querySelector(".KejjeYrLn");
    if (!line) continue;
    const en = clean(line.querySelector(".KejjeYrEn")?.textContent);
    const ja = clean(line.querySelector(".KejjeYrJp")?.textContent);
    return en || ja ? { en, zh: ja || undefined } : null;
  }
  return null;
}

function visibleText(node: Element): string {
  const innerText = (node as HTMLElement).innerText;
  return clean(typeof innerText === "string" ? innerText : node.textContent);
}

/**
 * Preserve the overview information exposed by Weblio's summary tables. This
 * covers the same sections consumed by zotero-pdf-translate's Weblio service,
 * while keeping definitions, pronunciation, and metadata in separate fields.
 */
function overviewExtras(doc: Document): string[] {
  const extras: string[] = [];
  const seen = new Set<string>();
  const add = (value: string): void => {
    const line = clean(value);
    if (!line || seen.has(line)) return;
    seen.add(line);
    extras.push(line);
  };
  const childLine = (node: Element): string => Array.from(node.children)
    .map(visibleText)
    .filter(Boolean)
    .join(": ");

  for (const summary of Array.from(doc.querySelectorAll(".summaryM:not(.descriptionWrp)"))) {
    for (const child of Array.from(summary.children)) {
      const line = childLine(child);
      // Pronunciation has its own structured field below; retain the syllable
      // and any other Weblio summary metadata without duplicating phonetics.
      if (line && !/発音記号|読み方/.test(line)) add(line);
    }
  }
  for (const table of Array.from(doc.querySelectorAll(".intrst"))) {
    const row = table.querySelector("tr");
    if (row) add(childLine(row));
  }
  return extras;
}

export function parseWeblioHtml(word: string, html: string): DictResult | null {
  const doc = parseHtml(html);
  const summary = clean(doc.querySelector(
    ".descriptionWrp .content-explanation.ej, #summary .content-explanation.ej",
  )?.textContent);
  const definitions: DictDefinition[] = [];
  const seenDefinitions = new Set<string>();
  let currentPos: string | undefined;
  const detail = doc.querySelector("#hideDictPrsKENEJ .Kejje, .Kejje");

  // Weblio's summary is the first translation line in zotero-pdf-translate.
  // Keep it first here too, followed by the more detailed sense breakdown.
  if (summary) {
    definitions.push({ meaning: summary });
    seenDefinitions.add(summary);
  }

  if (detail) {
    for (const block of Array.from(detail.querySelectorAll(":scope > .level0"))) {
      const pos = clean(block.querySelector(".KnenjSub")?.textContent);
      if (pos) currentPos = normalizedPos(pos);
      const meaning = clean(block.querySelector(".lvlB")?.textContent);
      if (!meaning || seenDefinitions.has(meaning)) continue;
      seenDefinitions.add(meaning);
      const definition: DictDefinition = { meaning };
      if (currentPos) definition.pos = currentPos;
      const example = exampleAfter(block);
      if (example?.en) {
        definition.example = example.en;
        definition.exampleZh = example.zh;
      }
      definitions.push(definition);
      if (definitions.length >= 12) break;
    }
  }

  if (definitions.length === 0) return null;

  let uk = "";
  let us = "";
  const unlabelled: string[] = [];
  for (const node of Array.from(doc.querySelectorAll("#summary .phoneticEjjeDesc"))) {
    const value = clean(node.textContent);
    const label = clean(node.nextElementSibling?.textContent);
    if (!value) continue;
    if (/英国|イギリス|UK/i.test(label)) uk ||= value;
    else if (/米国|アメリカ|US/i.test(label)) us ||= value;
    else unlabelled.push(value);
  }
  const phonetic = joinPhonetic(uk, us, !uk && !us ? unlabelled[0] : undefined);
  const audioNode = doc.querySelector("#summary audio.contentAudio source[src], .Kejje audio.contentAudio source[src]");
  const audioUrl = audioNode
    ? absUrl(audioNode.getAttribute("src") || "", entryUrl(word))
    : undefined;

  const examples: DictExample[] = [];
  const seenExamples = new Set<string>();
  for (const line of Array.from(doc.querySelectorAll("#hideDictPrsKENEJ .KejjeYrLn"))) {
    const en = clean(line.querySelector(".KejjeYrEn")?.textContent);
    const ja = clean(line.querySelector(".KejjeYrJp")?.textContent);
    const key = en || ja;
    if (!key || seenExamples.has(key)) continue;
    seenExamples.add(key);
    examples.push({ en, zh: ja || undefined });
    if (examples.length >= 8) break;
  }

  return {
    word,
    phonetic,
    audioUrl,
    definitions,
    examples,
    extras: overviewExtras(doc),
    source: ONLINE_DICT_NAMES.weblio,
    sourceUrl: entryUrl(word),
  };
}
