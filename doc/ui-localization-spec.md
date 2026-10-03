# Multilingual UI Specification

Status: Implemented
Initial locales: English, Japanese, Simplified Chinese  
Default locale: English

## 1. Purpose

Pick2anki will provide a multilingual user interface with English as the default language. The initial implementation must support:

- English (`en`)
- Japanese (`ja`)
- Simplified Chinese (`zh-Hans`)

The design must allow more UI languages to be added without changing feature logic or stored domain values.

This specification applies to text authored and displayed by Pick2anki. Dictionary data, bibliographic data, and user-created Anki names remain in their original language.

## 2. Goals

- Present a complete, consistent UI in each supported locale.
- Start new installations in English.
- Allow the user to select English, Japanese, Simplified Chinese, or the system language.
- Keep existing settings and imported Obsidian Pick2anki settings compatible.
- Make missing translations fall back safely to English.
- Keep translation concerns out of dictionary, Anki, and reader business logic.
- Make adding a locale primarily a catalog and registration change.
- Preserve untranslated dictionary definitions, examples, titles, names, and user input.

## 3. Non-goals

- Translating content returned by dictionary providers.
- Translating publication titles, author names, Anki deck names, note-type names, field names, or tags.
- Modifying existing Anki notes when the UI language changes.
- Detecting the language of dictionary content.
- Replacing the current stable IDs used for settings, dictionaries, field sources, or behavior options.

## 4. Locale identifiers and preferences

Use BCP 47-compatible locale identifiers:

```ts
export type SupportedLocale = "en" | "ja" | "zh-Hans";
export type LanguagePreference = SupportedLocale | "system";
```

Add a Zotero-specific setting:

```ts
uiLanguage: LanguagePreference;
```

The default value is `"en"`. Selecting `"system"` is an explicit user choice and does not change the installation default.

The stored preference value is independent of translated display labels. Existing setting keys and values, including `triggerMode: "ctrl"`, remain unchanged.

## 5. System locale resolution

When `uiLanguage` is `"system"`, normalize Zotero's locale and resolve it as follows:

| Zotero or operating-system locale | Resolved UI locale |
|---|---|
| `en`, `en-*` | `en` |
| `ja`, `ja-*` | `ja` |
| `zh`, `zh-CN`, `zh-SG`, `zh-Hans`, compatible `zh-*` locales using Simplified Chinese | `zh-Hans` |
| Unsupported locale | `en` |

Locale matching must be case-insensitive and normalize `_` to `-` before matching.

Traditional Chinese may later be registered as `zh-Hant`. Until that locale exists, unsupported Chinese variants fall back to English rather than silently presenting Simplified Chinese where script preference is explicit.

The fallback chain is:

1. Exact registered locale.
2. Registered compatible base or script locale.
3. English.

## 6. Source layout

Use a typed localization module:

```text
src/i18n/
  index.ts
  locale.ts
  messages.ts
  locales/
    en.ts
    ja.ts
    zh-Hans.ts
```

Responsibilities:

- `messages.ts`: canonical message schema and related types.
- `locale.ts`: preference resolution, system-locale normalization, and locale metadata.
- `index.ts`: public translation API.
- `locales/*.ts`: locale catalogs with no feature logic.

English is the canonical catalog and fallback. Japanese and Simplified Chinese must satisfy the same TypeScript schema.

## 7. Message catalog design

Catalog entries must contain complete phrases or sentences. Do not concatenate translated fragments because languages use different word order, counters, spacing, and punctuation.

```ts
export interface Messages {
  language: {
    label: string;
    description: string;
    english: string;
    japanese: string;
    simplifiedChinese: string;
    system: string;
  };

  reader: {
    sectionTitle: string;
    lookup: string;
    lookingUp: string;
    selectedPrompt: (word: string) => string;
    noResults: (word: string) => string;
  };

  anki: {
    addButton: string;
    preparing: string;
    fetchingAudio: string;
    adding: string;
    added: (word: string, deck: string) => string;
    duplicate: (word: string) => string;
  };

  settings: {
    dictionaries: string;
    anki: string;
    lookupAndDisplay: string;
    importAndBackup: string;
  };
}
```

Example dynamic messages:

```ts
// en.ts
added: (word, deck) => `Added “${word}” to “${deck}”.`

// ja.ts
added: (word, deck) => `「${word}」を「${deck}」に追加しました。`

// zh-Hans.ts
added: (word, deck) => `已将“${word}”添加到“${deck}”。`
```

Catalog functions return plain text. HTML escaping and DOM insertion remain the responsibility of the existing rendering layer. Catalog entries must not contain executable markup.

## 8. Public localization API

The localization module exposes a small API:

```ts
getLanguagePreference(): LanguagePreference;
getLocale(): SupportedLocale;
getMessages(locale?: SupportedLocale): Messages;
setLanguagePreference(value: LanguagePreference): void;
```

Feature modules obtain a message catalog and use it for display:

```ts
const messages = getMessages();
button.textContent = messages.reader.lookup;
status.textContent = messages.anki.added(word, deck);
```

Feature code must not branch on locale identifiers. Locale-specific wording belongs only in catalogs.

## 9. Language selector behavior

Place **Interface language** at the top of the Pick2anki settings panel. Display language names in their native form:

- English
- 日本語
- 简体中文
- Use system language

Changing the selection must:

1. Persist `uiLanguage` immediately.
2. Re-render the settings panel in the selected language.
3. Preserve cached Anki decks, note types, and fields.
4. Preserve text currently entered in import and export controls where practical.
5. Apply the selected language to subsequently opened reader popups.

An already open reader popup does not need live translation. Closing and reopening it applies the new locale and avoids changing messages during an active lookup.

## 10. Translation scope

Translate all plugin-authored user-facing text:

- Settings headings, labels, descriptions, options, placeholders, and buttons.
- Reader-popup headings, buttons, instructions, and state messages.
- Loading, success, duplicate, validation, and failure feedback.
- Dictionary source display names.
- Confirmation dialogs.
- Import, export, and reset results.
- Empty-result and hidden-source notices.
- Accessibility labels, titles, and tooltips.
- Plugin-generated headings and provenance labels used in newly created Anki content, subject to the card-label policy below.

Do not translate or alter:

- Dictionary definitions and examples.
- Translations supplied by dictionary providers.
- Publication titles, author names, and citation data.
- Anki deck, note-type, and field names.
- User-entered tags and settings content.
- Technical details returned by external services.
- Source-site strings used internally to parse dictionary pages.

Chinese parsing tokens such as pronunciation or part-of-speech markers may remain in adapter logic when required to interpret source data. They are implementation data, not UI text.

## 11. Dictionary display names

Settings and lookup results store stable dictionary IDs:

```ts
type DictionaryId =
  | "youdao"
  | "collins"
  | "oxford"
  | "bing"
  | "cambridge";
```

Resolve display names from the active catalog at render time. Never persist translated names.

| ID | English | Japanese | Simplified Chinese |
|---|---|---|---|
| `youdao` | Youdao Dictionary | 有道辞書 | 有道词典 |
| `collins` | Collins English–Chinese | コリンズ英中辞典 | 柯林斯英汉词典 |
| `oxford` | Oxford Advanced Learner's Dictionary | オックスフォード現代英英辞典 | 牛津高阶学习词典 |
| `bing` | Bing Dictionary | Bing 辞書 | 必应词典 |
| `cambridge` | Cambridge Dictionary | Cambridge Dictionary | 剑桥词典 |

## 12. Errors and progress states

Application behavior must not depend on translated messages. Use stable error and progress codes:

```ts
type ErrorCode =
  | "anki_unreachable"
  | "anki_invalid_response"
  | "dictionary_no_result"
  | "dictionary_http_error"
  | "invalid_settings_json";

interface AppError {
  code: ErrorCode;
  detail?: string;
}

type ProgressStage =
  | "preparing"
  | "looking_up"
  | "fetching_audio"
  | "adding_note";
```

Translate codes at the display boundary. External service details remain unchanged and follow a localized explanation.

Each asynchronous operation captures its resolved locale when it begins. All progress and completion messages for that operation use the captured catalog, even if the user changes the language before it finishes.

## 13. Anki card-label language

UI language and generated card labels are related but separate concerns. Reserve this setting:

```ts
cardLabelLanguage: "ui" | SupportedLocale;
```

The default is `"ui"`. It controls only plugin-authored labels such as “Item link,” “More examples,” and fallback context explanations. It never translates dictionary content or bibliographic data.

The first multilingual release may keep this setting internal and always use `"ui"`. The data model should support exposing it later without restructuring card generation. Changing it affects only newly generated notes; existing Anki notes are not modified.

## 14. Terminology

Use consistent terminology across catalogs:

| Concept | English | Japanese | Simplified Chinese |
|---|---|---|---|
| Lookup | Look up | 検索 | 查词 |
| Manual lookup | Manual lookup | 手動検索 | 手动查词 |
| Deck | Deck | デッキ | 牌组 |
| Note type | Note type | ノートタイプ | 笔记类型 |
| Field mapping | Field mapping | フィールド割り当て | 字段映射 |
| Context sentence | Context sentence | 文脈の文 | 原句上下文 |

Keep the stored trigger value `"ctrl"` for compatibility, but display it as **Manual lookup**, **手動検索**, or **手动查词**. The current implementation waits for a button click and does not inspect the Ctrl key.

## 15. Formatting and layout

Use locale-aware platform helpers where useful:

```ts
new Intl.ListFormat(locale);
new Intl.NumberFormat(locale);
```

Do not hard-code language-specific list separators or quotation marks in feature logic. Complete catalog messages control their own punctuation.

The UI must accommodate different text lengths:

- Allow headings, labels, descriptions, options, and buttons to wrap.
- Apply `min-width: 0` to relevant flex children.
- Prefer logical CSS properties such as `margin-inline-start`.
- Do not truncate settings descriptions.
- Use a readable line height of at least `1.5` for Japanese and Chinese text.
- Keep dictionary content selectable in every UI locale.
- Verify the reader popup at its 240 px minimum width and at 200% text scaling.

## 16. Adding another locale

Adding a supported locale should require these steps only:

1. Add `src/i18n/locales/<locale>.ts` implementing `Messages`.
2. Register locale metadata:

   ```ts
   {
     id: "fr",
     nativeName: "Français",
     resolveFrom: ["fr", "fr-FR", "fr-CA"],
   }
   ```

3. Add the locale to the language selector through the shared registry.
4. Run catalog completeness and rendering tests.
5. Review terminology and narrow-layout behavior with a fluent speaker.

Feature modules must not require changes merely because a locale was added.

## 17. Migration and compatibility

- Existing installations without `uiLanguage` receive the English default.
- Existing preference keys and serialized values remain valid.
- Imported Obsidian settings ignore unknown localization settings as before.
- Exported settings include `uiLanguage` and, when implemented, `cardLabelLanguage`.
- Dictionary and field-source IDs remain unchanged.
- Existing Anki notes and media are untouched.

## 18. Verification requirements

Automated verification must cover:

- English is the installation default.
- Explicit English, Japanese, and Simplified Chinese selections persist.
- System-locale resolution handles regional variants.
- Unsupported locales fall back to English.
- Every registered catalog implements the complete message schema.
- Dynamic values are escaped at HTML rendering boundaries.
- Dictionary and user content is unchanged across UI locales.
- Settings IDs and imported data remain compatible.
- Language changes preserve cached Anki metadata and relevant form content.
- Reader operations use one locale throughout their lifetime.
- Error and progress behavior uses stable codes rather than translated-string comparisons.
- All three locales fit settings and reader layouts at supported minimum sizes.

Manual review must cover terminology, punctuation, natural phrasing, Japanese and Chinese line wrapping, and mixed-language dictionary results.

## 19. Implementation sequence

1. Add locale types, registry, resolution, and English fallback.
2. Add `uiLanguage` to settings and defaults.
3. Create complete English, Japanese, and Simplified Chinese catalogs.
4. Move settings-panel strings into catalogs and add the language selector.
5. Move reader-popup and dictionary-display strings into catalogs.
6. Introduce structured error and progress codes at UI boundaries.
7. Localize plugin-generated Anki labels while preserving source content.
8. Update tests and documentation.
9. Run catalog-completeness, layout, settings-compatibility, and mocked-service tests.

