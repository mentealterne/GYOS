// How the names in templates/module and templates/host-module become a module's own names.
// Used by new-module.ts. No dependencies; runs with Node's type stripping.
//
// Two sets of tokens are renamed, in one pass over the template's text, so a replacement is never
// renamed again (a module called "line-items" keeps its name):
//
// The module: sample, Sample, SAMPLE → kebab-case, PascalCase, UPPER_SNAKE, wherever they stand.
//
// The example area and its entity: items/item, Items/Item, ITEMS/ITEM → the area (plural) and the
// entity (singular). A lowercase word takes the form its place calls for:
//
//   | Where it stands                                                  | items →          |
//   | ---------------------------------------------------------------- | ---------------- |
//   | A file or folder name                                            | treatment-plans  |
//   | In a string, a comment or Markdown code, next to "/" or "-":     | treatment-plans  |
//   |   an import path, the "./items" export, a URL path, a file name  |                  |
//   | Next to "_", or a whole quoted string ("items"): an SQL name     | treatment_plans  |
//   | Anything under drizzle/: the migration's SQL and its snapshot    | treatment_plans  |
//   | Code: an identifier, a word joined to one (itemId), or a quoted  | treatmentPlans   |
//   |   key that indexes a type or an object (Deps["items"])           |                  |
//   | Anywhere else in a string, a comment, a .feature or Markdown     | treatment plans  |
//
// Items/Item become PascalCase (TreatmentPlans), except a word that stands alone in prose (a
// comment, a .feature, Markdown), which becomes "Treatment plans". ITEMS/ITEM become UPPER_SNAKE.
// In prose, the article before the singular follows the new word: "an item" → "a treatment plan",
// by its first letter (a, e, i, o, u take "an"), which is right for most words, not all.
import { readFileSync } from "node:fs";

/** The forms of one kebab-case name. */
export interface Forms {
  kebab: string;
  camel: string;
  pascal: string;
  upper: string;
  snake: string;
  /** Lowercase words, for prose: "treatment plans". */
  words: string;
  /** The same, capitalised: "Treatment plans". */
  sentence: string;
}

export function formsOf(kebab: string): Forms {
  const words = kebab.split("-");
  const capitalised = words.map((word) => word.charAt(0).toUpperCase() + word.slice(1));
  const prose = words.join(" ");
  return {
    kebab,
    camel: [words[0] ?? "", ...capitalised.slice(1)].join(""),
    pascal: capitalised.join(""),
    upper: words.map((word) => word.toUpperCase()).join("_"),
    snake: words.join("_"),
    words: prose,
    sentence: prose.charAt(0).toUpperCase() + prose.slice(1),
  };
}

export interface TemplateNames {
  module: Forms;
  /** The area: "items" in the template. */
  area: Forms;
  /** Its entity: "item" in the template. */
  entity: Forms;
}

export const TEMPLATE_AREA = "items";
export const TEMPLATE_ENTITY = "item";

type Context = "path" | "code" | "comment" | "string" | "prose" | "sql";

const TOKENS = /SAMPLE|Sample|sample|ITEMS|ITEM|Items|Item|items|item/g;
const LETTER_OR_DIGIT = /[A-Za-z0-9]/;

/** Where each character of a TypeScript or JavaScript file stands: code, comment or string. */
function codeContexts(text: string): Context[] {
  const contexts = new Array<Context>(text.length).fill("code");
  const mark = (context: Context, start: number, end: number): void => {
    contexts.fill(context, start, end);
  };
  const lineEnd = (from: number): number => {
    const end = text.indexOf("\n", from);
    return end === -1 ? text.length : end;
  };
  const quoteEnd = (from: number, quote: string): number => {
    let index = from + 1;
    while (index < text.length && text[index] !== quote && text[index] !== "\n") {
      index += text[index] === "\\" ? 2 : 1;
    }
    return Math.min(index + 1, text.length);
  };
  /** The end of a regular expression literal starting at `from`, or -1 if it isn't one. */
  const regexEnd = (from: number): number => {
    let index = from + 1;
    let inClass = false;
    while (index < text.length && text[index] !== "\n") {
      const char = text[index];
      if (char === "\\") index += 1;
      else if (char === "[") inClass = true;
      else if (char === "]") inClass = false;
      else if (char === "/" && !inClass) {
        index += 1;
        while (index < text.length && /[a-z]/.test(text[index] ?? "")) index += 1;
        return index;
      }
      index += 1;
    }
    return -1;
  };

  // Scans code from `start`; inside a template literal's ${…}, returns at its closing brace.
  const code = (start: number, interpolation: boolean): number => {
    let index = start;
    let depth = 0;
    let previous = "";
    while (index < text.length) {
      const char = text[index] ?? "";
      const next = text[index + 1];
      if (char === "/" && next === "/") {
        const end = lineEnd(index);
        mark("comment", index, end);
        index = end;
        continue;
      }
      if (char === "/" && next === "*") {
        const close = text.indexOf("*/", index + 2);
        const end = close === -1 ? text.length : close + 2;
        mark("comment", index, end);
        index = end;
        continue;
      }
      if (char === '"' || char === "'") {
        const end = quoteEnd(index, char);
        mark("string", index, end);
        index = end;
        previous = char;
        continue;
      }
      if (char === "`") {
        index = template(index);
        previous = "`";
        continue;
      }
      if (char === "/" && (previous === "" || "(,=:[!&|?{};+-*%<>~^".includes(previous))) {
        const end = regexEnd(index);
        if (end !== -1) {
          index = end;
          previous = "/";
          continue;
        }
      }
      if (char === "{") depth += 1;
      if (char === "}") {
        if (interpolation && depth === 0) return index;
        depth -= 1;
      }
      if (!/\s/.test(char)) previous = char;
      index += 1;
    }
    return index;
  };

  // A template literal from its backtick: string, except the code inside ${…}.
  const template = (start: number): number => {
    let index = start + 1;
    let from = start;
    while (index < text.length) {
      const char = text[index];
      if (char === "\\") {
        index += 2;
        continue;
      }
      if (char === "`") {
        mark("string", from, index + 1);
        return index + 1;
      }
      if (char === "$" && text[index + 1] === "{") {
        mark("string", from, index + 2);
        const close = code(index + 2, true);
        from = close;
        index = close + 1;
        continue;
      }
      index += 1;
    }
    mark("string", from, index);
    return index;
  };

  code(0, false);
  return contexts;
}

/** Markdown: code spans and fenced blocks read like strings, the rest is prose. */
function markdownContexts(text: string): Context[] {
  const contexts = new Array<Context>(text.length).fill("prose");
  for (const match of text.matchAll(/```[\s\S]*?```|`[^`\n]+`/g)) {
    contexts.fill("string", match.index, match.index + match[0].length);
  }
  return contexts;
}

function contextsOf(file: string, text: string): Context[] {
  const all = (context: Context): Context[] => new Array<Context>(text.length).fill(context);
  if (file.startsWith("drizzle/") || file.endsWith(".sql")) return all("sql");
  if (file.endsWith(".feature")) return all("prose");
  if (file.endsWith(".md")) return markdownContexts(text);
  if (/\.[cm]?[jt]s$/.test(file)) return codeContexts(text);
  return all("string"); // package.json and the like
}

/**
 * The area's or the entity's form for one occurrence of a token, from its context and the
 * characters around it: `before` and `after` touch it, `opening` comes before `before`.
 */
function areaForm(
  token: string,
  context: Context,
  { opening, before, after }: { opening: string; before: string; after: string },
  forms: Forms,
): { value: string; prose: boolean } {
  const form = (value: string) => ({ value, prose: false });
  if (token === token.toUpperCase()) return form(forms.upper);
  const joined = LETTER_OR_DIGIT.test(before) || LETTER_OR_DIGIT.test(after);
  if (token.charAt(0) === "I") {
    const alone = (context === "prose" || context === "comment") && !joined;
    return alone ? { value: forms.sentence, prose: true } : form(forms.pascal);
  }
  if (context === "path") return form(forms.kebab);
  if (context === "sql") return form(forms.snake);
  if (context === "code") return form(forms.camel);
  if (before === "/" || before === "-" || after === "/" || after === "-") return form(forms.kebab);
  if (before === "_" || after === "_") return form(forms.snake);
  if (context === "string" && before === '"' && after === '"') {
    return form(opening === "[" ? forms.camel : forms.snake);
  }
  if (joined) return form(forms.camel);
  return { value: forms.words, prose: true };
}

/** "an item" → "a treatment plan": the article right before a prose word follows its new start. */
function withArticle(rendered: string, word: string): string {
  return rendered.replace(/(^|[^A-Za-z])(an|a|An|A) $/, (_match, start: string, article: string) => {
    const wanted = /^[aeiou]/i.test(word) ? "an" : "a";
    const cased = article.charAt(0) === "A" ? wanted.charAt(0).toUpperCase() + wanted.slice(1) : wanted;
    return `${start}${cased} `;
  });
}

function render(text: string, contexts: (index: number) => Context, names: TemplateNames): string {
  let rendered = "";
  let last = 0;
  for (const match of text.matchAll(TOKENS)) {
    const token = match[0];
    const start = match.index;
    const end = start + token.length;
    rendered += text.slice(last, start);
    last = end;
    const lower = token.toLowerCase();
    if (lower === "sample") {
      rendered += token === "SAMPLE" ? names.module.upper : token === "Sample" ? names.module.pascal : names.module.kebab;
      continue;
    }
    const forms = lower === TEMPLATE_AREA ? names.area : names.entity;
    const around = { opening: text[start - 2] ?? "", before: text[start - 1] ?? "", after: text[end] ?? "" };
    const { value, prose } = areaForm(token, contexts(start), around, forms);
    if (prose && lower === TEMPLATE_ENTITY) rendered = withArticle(rendered, value);
    rendered += value;
  }
  return rendered + text.slice(last);
}

/** A template file's contents, renamed. `file` is its path in the template, with "/". */
export function renderText(file: string, text: string, names: TemplateNames): string {
  const contexts = contextsOf(file, text);
  return render(text, (index) => contexts[index] ?? "code", names);
}

/** A template file's path, renamed: every token in its kebab-case form. */
export function renderPath(file: string, names: TemplateNames): string {
  return render(file, () => "path", names);
}

const RESERVED_WORDS =
  "await break case catch class const continue debugger default delete do else enum export extends false finally for function if implements import in instanceof interface let new null package private protected public return static super switch this throw true try typeof var void while with yield";

/**
 * Every identifier in the code of the given template files that is not an area or entity token,
 * plus JavaScript's reserved words: the names an area or an entity must not turn into.
 */
export function identifiersIn(files: readonly { file: string; path: string }[]): Set<string> {
  const identifiers = new Set(RESERVED_WORDS.split(" "));
  for (const { file, path } of files) {
    if (!/\.[cm]?[jt]s$/.test(file)) continue;
    const text = readFileSync(path, "utf8");
    const contexts = codeContexts(text);
    for (const match of text.matchAll(/[A-Za-z_$][\w$]*/g)) {
      if (contexts[match.index] === "code" && !/item/i.test(match[0])) identifiers.add(match[0]);
    }
  }
  return identifiers;
}
