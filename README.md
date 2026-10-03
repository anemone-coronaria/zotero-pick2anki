# zotero-pick2anki

English | [简体中文](README-cn.md)

> **A dictionary plugin for Zotero**: select an English word or phrase in the built-in PDF/EPUB reader → get definitions from six online dictionaries → save an Anki vocabulary card with the sentence where you encountered it.

## What problem does it solve?

Reading English literature involves two separate tasks: **looking up words** (selecting a word in the PDF reader and getting definitions from several sources) and **creating flashcards** (saving the word and its original sentence for review in Anki). Translation plugins help you understand sentences, but do not collect vocabulary cards for you.

This plugin handles words and phrases of up to five words, rather than whole sentences. It shares Zotero's selection popup with [zotero-pdf-translate](https://github.com/windingwind/zotero-pdf-translate), so you can use that plugin for longer passages. Vocabulary cards capture the surrounding sentence to retain context without turning an entire sentence into the lookup target.

The original author built this plugin with DeepSeek-assisted “vibe coding” and limited programming experience. AI made it easier to create a tool tailored to their needs, but also led to an increasing number of personal scripts and plugins to maintain. This project aims to keep a useful workflow simple.

zotero-pick2anki focuses on **select → look up → save a card**. It does not translate whole sentences and requires no AI or translation API key.

## Relationship with zotero-pdf-translate

| | [zotero-pdf-translate](https://github.com/windingwind/zotero-pdf-translate) | **zotero-pick2anki** |
|---|---|---|
| Lookup target | Sentences and paragraphs | English words and phrases |
| Output | Translations (DeepL, Youdao, GPT, etc.) | Aggregated definitions, phonetics, and examples |
| Destination | Translation panel in the reader | **Anki vocabulary cards** through AnkiConnect |
| API key | Required by most services | **Not required** for the six public dictionary sources |
| Purpose | Understand **this passage** | Remember **this word** |

Both plugins append their own panels to Zotero's selection popup through the official `Zotero.Reader` event, `renderTextSelectionPopup`. They can be enabled together: one displays translations, while the other displays dictionary definitions and the ➕ Anki button.

> **License distinction:** zotero-pdf-translate uses **AGPL-3.0-or-later**, not MIT. This project references its architectural ideas—using Zotero's selection popup and isolating events inside panel controls—but states that it has **not copied its code**. This project is distributed under MIT. If you incorporate code from that project, its AGPL licensing obligations must be addressed.

## Features

| Feature | Description |
|---|---|
| **Multiple dictionary sources** | Youdao (including licensed Collins English–Chinese data), Weblio (English–Japanese), the Collins English–Chinese website, Oxford Advanced Learner's Dictionary, Bing (English–Chinese), and Cambridge. Enable or disable sources and drag to reorder them. The popup fully displays only the first two successful sources to keep it compact. |
| **English words and phrases only** | Uses Pick2anki's selection checks: Chinese text, paragraphs, and selections exceeding five words or 60 characters do not trigger lookups. |
| **One-click Anki cards** | Connects directly to local Anki through AnkiConnect, normally at `127.0.0.1:8765`. Saves to the chosen deck and note type, with button feedback for saving, success (✔), or an existing note (↺). |
| **Nine configurable field sources** | Map word/phrase, context, phonetics, single definition, all definitions, examples, extras, audio, and source information to fields in your note type. Blank mappings are omitted; multiple sources mapped to one field are merged. |
| **Pronunciation** | Prefers dictionary recordings (UK/US), then tries Youdao pronunciation and optional Edge TTS. Audio is stored in Anki's media library through AnkiConnect and referenced as `[sound:…]` for offline playback. |
| **Context and provenance** | Attempts to extract the complete sentence from the PDF text layer, falling back to the selected text. The source field includes dictionary links, the Zotero item URI, and publication information: title, authors, and year. |
| **Multilingual interface and Obsidian-compatible settings** | The UI supports English, Japanese, and Simplified Chinese, with English as the default and an optional system-language mode. Setting keys and shared defaults remain compatible with the Obsidian version. |
| **Lightweight** | No AI or sentence-translation dependency, no lookup cache, no additional hosted backend, and no API key. |

## Installation

### Option 1: Install an .xpi

1. Download `zotero-pick2anki.xpi` from [this fork's latest release](https://github.com/anemone-coronaria/zotero-pick2anki/releases/latest), or build from source below. The local build output is `.scaffold/build/zotero-pick2anki.xpi`.
2. In Zotero, open **Tools → Plugins** (called “Add-ons” in Zotero 7–9).
3. Open the gear menu and choose **Install Plugin From File…**, then select the `.xpi`.
4. Restart Zotero. **Pick2anki** should appear under Tools → Plugins.
5. Open Zotero → Edit → Settings → **Pick2anki** to configure dictionary sources and Anki saving.

> Zotero allows unsigned `.xpi` plugins: `xpinstall.signatures.required` is disabled, so Mozilla signing is not required.

### Option 2: Build from source

```bash
npm install                 # Node >= 22.8 is required by zotero-plugin-scaffold
npm run build               # TypeScript checking + zotero-plugin-scaffold packaging
# Output: .scaffold/build/zotero-pick2anki.xpi and .scaffold/build/addon/

npm run icons               # Optional: regenerate icons using Node, without graphics libraries
npm test                    # Live dictionary + AnkiConnect integration tests; Anki must be running
npm start                   # Launch Zotero with hot reload; configure its path in .env
```

`npm start` requires a `.env` file (following the zotero-plugin-scaffold template):

```ini
ZOTERO_PLUGIN_ZOTERO_BIN_PATH=C:\Program Files\Zotero\zotero.exe
ZOTERO_PLUGIN_PROFILE_PATH=            # Optional: test profile
ZOTERO_PLUGIN_DATA_DIR=                # Optional: test data directory
```

### Releases

Repository: <https://github.com/anemone-coronaria/zotero-pick2anki>

Upstream project: [soyami/zotero-pick2anki](https://github.com/soyami/zotero-pick2anki). This fork's build configuration uses its own release update manifest.

**A routine release has three steps**; CI handles the rest:

```bash
# 1) Update package.json version (e.g. 1.0.6 -> 1.0.7), then commit and push
git commit -am "release: 1.0.7" && git push
# 2) Create a numeric tag without a v prefix; it must match version
git tag 1.0.7
# 3) Push the tag to trigger the workflow
git push origin 1.0.7
```

The workflow checks types and packages the `.xpi`, attaches it to the `1.0.7` release, updates the fixed `release` tag with `update.json` and a copy of the `.xpi` marked as a prerelease, then checks that `latest` points to a version release containing the `.xpi`. A failed check fails the job.

```bash
npm run build          # Local build: .scaffold/build/zotero-pick2anki.xpi and update.json
```

The GitHub Actions workflow is [`.github/workflows/release.yml`](.github/workflows/release.yml). Pushing a numeric tag such as `1.0.7` builds the plugin, attaches the `.xpi` to that tag's release, and uploads `update.json` to the fixed `release` tag.

The two releases have different purposes:

| Tag | Contents | Purpose |
|---|---|---|
| `<version>` (e.g. `1.0.7`) | `zotero-pick2anki.xpi` | Downloads for users and plugin-directory scrapers. |
| `release` (fixed) | `update.json` and a backup `.xpi` | Update-manifest storage, addressed by the manifest's `update_url`. Marked as a **prerelease** so GitHub's `latest` remains the actual version release containing the installable package. |

zotero-plugin-scaffold generates `update.json` with the version, download URL, SHA-512 hash, and compatibility range. It both enables update notifications and allows widening `strict_max_version` without rebuilding the `.xpi`, so compatibility with future Zotero versions can be updated through the manifest.

## Usage

At the top of Pick2anki's settings, choose English, 日本語, 简体中文, or the system language. The settings panel updates immediately, and newly opened reader popups use the selected language. The next selector controls labels that Pick2anki adds to new Anki cards; dictionary definitions, publication data, and existing Anki names remain unchanged.

### 1. Look up a word

**Select an English word or phrase** in Zotero's PDF/EPUB reader. An **Online dictionary** section appears in the selection popup:

- Part-of-speech badges (noun, adj., etc.), separate colors for English and Chinese definitions, and examples following their definitions. Matching words are bold.
- Content scrolls inside the panel when it exceeds the height limit (260 px by default).
- Direct selection mode queries immediately. “Ctrl+selection” mode instead shows **Look up**; click it to query.

Under Settings → Pick2anki → Online dictionary lookup, drag sources to reorder them, use the switches to disable sources, and click **Test lookup: hello** to check connectivity.

> Weblio, Collins, Oxford, and Cambridge may change their websites or block requests (including HTTP 403 responses observed in testing). Failed sources are skipped. The upstream documentation reports Youdao and Bing as the most reliable sources.

### 2. Save to Anki

Install Anki desktop and enable [AnkiConnect](https://foosoft.net/projects/anki-connect/) (Anki → Tools → Add-ons → Get Add-ons, code `2055492159`). Dictionary lookups work without Anki.

Under Settings → Pick2anki → Save Anki vocabulary cards:

1. Enable Anki saving and click **Test connection and load** to retrieve decks and note types.
2. Choose a target deck (subdecks use `::`) and note type. Changing the note type loads its fields automatically.
3. Use the field-mapping dropdowns to assign each content source to a field. Leave a mapping blank to omit it.
4. Optionally enable automatic saving after lookup and configure duplicate handling (skip/add), duplicate scope, and tags.
5. Click **Save test card: hello** to test lookup and saving in the selected deck and note type.

Click **➕ Anki** in the selection popup to save. The button changes to ⏳ while saving, ✔ on success, ↺ if the note already exists, or back to ➕ on failure, with an inline error message.

**Recommended field mappings** for the nine-field Pick2anki template:

| Content source | Recommended field | Description |
|---|---|---|
| Word/phrase | `Word` | The lookup target. |
| Context | `Context` | The selected text, expanded to the surrounding PDF sentence where possible when sentence expansion is enabled, plus publication information. |
| Phonetics | `Phonetic` | UK/US IPA phonetics, deduplicated across sources. |
| Single definition | `SingleDef` | The first brief definition with its example. |
| All definitions | `AllDefs` | Complete definitions from successful sources, with source headings when multiple sources contribute. |
| Examples | `Examples` | Examples already appear beneath definitions, so a separate mapping is usually unnecessary. |
| Extras | `Extra` | Inflections, collocations, and exam vocabulary labels. |
| Audio | `Audio` | Audio stored through AnkiConnect and referenced as `[sound:….mp3]`. |
| Source | `Source` | Dictionary links, the Zotero item URI, and publication information. |

> Usually choose either Single definition or All definitions. The recommended template uses `AllDefs` when available and falls back to `SingleDef` otherwise.

### 3. Settings reference

Shared settings use the same keys as the Obsidian version of Pick2anki:

| Setting | Key | Default | Description |
|---|---|---|---|
| Interface language | `uiLanguage` | `en` | `en`, `ja`, `zh-Hans`, or `system`. System mode follows Zotero/OS and falls back to English for unsupported locales. |
| Card label language | `cardLabelLanguage` | `ui` | Selectable below the interface language. Uses the UI language for Pick2anki-authored card labels, or a fixed supported language. Dictionary and bibliographic content is preserved. |
| Trigger mode | `triggerMode` | `direct` | `direct`: query on selection; `ctrl`: click Look up in the popup. |
| Trigger delay | `triggerDebounce` | `500` | Reserved for compatibility with the Obsidian schema; Zotero uses selection events and does not need debouncing. |
| Dictionary sources and order | `onlineDictSources` | Youdao → Weblio → Bing → Cambridge → Collins → Oxford | Enable/disable and drag to reorder. |
| Enable Anki saving | `ankiEnabled` | `false` | Enables saving cards. |
| Local bridge URL | `ankiConnectUrl` | `http://127.0.0.1:8765` | AnkiConnect endpoint. |
| Target deck / note type | `ankiDeck` / `ankiNoteType` | Empty | Select after loading from Anki. |
| Field mapping | `ankiFieldMap` | `{}` | Content source → note-type field name. |
| Save automatically after lookup | `ankiAutoAdd` | `false` | Automatically saves successful lookups. |
| Duplicate handling | `ankiDup` | `skip` | `skip`: skip duplicates; `add`: allow duplicates. |
| Duplicate scope | `ankiDupScope` | `deck` | `deck`: target deck; `model`: entire note type. |
| Tags | `ankiTags` | `pick2anki` | Comma-separated tags. |

Zotero-specific settings have defaults and do not change the shared keys:

| Setting | Key | Default | Description |
|---|---|---|---|
| Popup width | `popupWidth` | `400` | Fixed panel width in pixels, limited to 240–720 and the reader width. The host popup's 198 px width cap is raised to panel width + 20 px. |
| Maximum popup height | `popupMaxHeight` | `260` | Total panel height in pixels, also constrained by 45% of the reader height. The header and buttons remain visible while definitions scroll. |
| Sentence expansion | `sentenceExpand` | `true` | Extract the surrounding sentence from the PDF text layer; fall back to selected text. |
| Include publication information | `showCite` | `true` | Append title, authors, and year to context/source fields. |
| Edge TTS fallback | `edgeTtsFallback` | `false` | Last pronunciation fallback; see [Known limitations](#known-limitations), item 1. Disabled by default to avoid slow saving. |

Settings are stored in Zotero preferences (`about:config` → `extensions.zotero.zoteropick2anki.*`). Arrays and objects are stored as JSON strings.

### 4. Migrate from Obsidian Pick2anki

Open Settings → Pick2anki → Migration / backup. Paste the full contents of `<your-vault>/.obsidian/plugins/pick-to-anki/data.json` into the Import settings text box, then click Import.

Matching setting keys allow migration of dictionary order and enabled sources, Anki deck/note type/field mappings, tags, and other shared settings. Unrecognized keys are ignored.

## Known limitations

1. **Edge TTS is best effort in Zotero.** Browser WebSockets cannot customize `Cookie`, `Origin`, or `User-Agent` headers, while the Edge TTS endpoint requires a MUID cookie. The plugin injects MUID through the cookie service (`ensureMuidCookie` in [`src/modules/edge-tts.ts`](src/modules/edge-tts.ts)), but the service may still reject requests without the expected Origin. The fallback chain is **dictionary MP3 → Youdao pronunciation (HTTP, 8-second timeout) → optional Edge TTS (disabled by default)**, implemented by `storeAudio` in [`anki.ts`](src/modules/anki.ts). If all fail, only the audio field is omitted; the card can still be saved.
2. **Sentence expansion uses heuristics.** PDF text layers vary with layout. The extracted sentence must contain the target word and have a reasonable length; otherwise the plugin falls back to **the selected text**. EPUB DOM structures vary more, so fallback is more likely. Sentence expansion can be disabled.
3. **Dictionary sites may block scraping.** Weblio, Collins, Oxford, and Cambridge may change their markup or return HTTP 403. Failure affects only that source.
4. **Only English words and phrases are supported.** Chinese text, paragraphs, and selections longer than five words or 60 characters do not trigger lookup, matching the Obsidian version.
5. **Zotero 7 or later is required**, with the manifest declaring `strict_min_version: 7.0` and `strict_max_version: 10.9.9`. Versions outside that range may reject the plugin as incompatible.
6. **Update manifest and releases.** The configured `update_url` is `https://github.com/anemone-coronaria/zotero-pick2anki/releases/download/release/update.json`. If `update.json` is not published there, update checks return 404 without affecting normal use. See [Releases](#releases) for the publishing workflow.
7. **AnkiConnect port/CORS.** The default endpoint is `127.0.0.1:8765`. If a customized `webCorsOriginList` causes rejected requests, add the appropriate origin or `*` to the allowlist. Zotero's privileged requests normally omit `Origin`, so changes are usually unnecessary.

## Privacy and network behavior

Zotero plugins have full access to the local machine. This plugin's network behavior is described below:

- **Dictionary lookups:** ordinary HTTPS requests to Youdao, Weblio, Bing, Cambridge, Oxford, and Collins to read entries or APIs. Pronunciation MP3s are downloaded from their audio CDNs. Requests use a common browser User-Agent and do not include publication contents or account credentials.
- **Saving cards:** connects to local AnkiConnect at `127.0.0.1:8765` by default, without a third-party intermediary. Selected words, context sentences, and definitions are written to local Anki when saving is requested, including when automatic saving is enabled.
- **Data collection:** no accounts, API keys, telemetry, or analytics. The plugin does not collect or upload your library, annotations, or reading activity.
- **Update checks:** Zotero periodically requests `update.json` from the release URL configured in the manifest. Automatic plugin updates can be disabled in Zotero preferences.
- **Optional speech synthesis:** if Edge TTS fallback is enabled and earlier audio sources fail, the selected word or phrase is sent to Microsoft's speech service.

## License and acknowledgments

MIT; see [`LICENSE`](LICENSE). This project is derived from the MIT-licensed Obsidian plugin **Pick2anki**. Its original license is preserved in [`LICENSE-Pick2anki`](LICENSE-Pick2anki).

- **[Pick2anki](https://github.com/soyami/pick2anki)** — MIT © soyami. The original five dictionary adapters, shared dictionary schema, AnkiConnect client, Anki field HTML generation, Edge TTS protocol implementation, popup design, and settings UI were ported from this project. The Weblio adapter was added for this Zotero plugin. Pick2anki is the foundation of this plugin.
- **[zotero-plugin-template](https://github.com/windingwind/zotero-plugin-template)** — AGPL-3.0-or-later. This project follows its organization and zotero-plugin-scaffold configuration style, plus the manifest/bootstrap skeleton originating from Zotero's official [Make It Red](https://github.com/zotero/make-it-red) example and [Zotero 7 developer documentation](https://www.zotero.org/support/dev/zotero_7_for_developers). The project states that no business logic was copied.
- **[zotero-pdf-translate](https://github.com/windingwind/zotero-pdf-translate)** — AGPL-3.0-or-later. Referenced for architectural ideas only, with no copied code according to this project. The plugins complement one another; see [Relationship with zotero-pdf-translate](#relationship-with-zotero-pdf-translate).
- **[AnkiConnect](https://foosoft.net/projects/anki-connect/)** — the local JSON-RPC bridge used to save cards in Anki.
- Dictionary data belongs to its respective providers (Youdao, Weblio, Collins, Oxford, Bing, and Cambridge). The plugin parses entries for personal study; please observe each provider's terms.
