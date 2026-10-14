import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/**
 * Escapes the HTML-significant characters in user-supplied text so it can never
 * be parsed as markup by the browser.
 *
 * Question and answer bodies are plain text (the composer is a <Textarea>), and
 * the renderer only ever emits a fixed, known set of tags itself. Escaping first
 * therefore neutralises stored XSS while leaving every intended Markdown feature
 * intact, because backticks, hashes and newlines are untouched.
 *
 * A single pass with a lookup table is used deliberately: chained .replace()
 * calls would double-escape (turning "&" into "&amp;amp;").
 */
export function escapeHtml(value: string): string {
  return String(value ?? "").replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);
}

/**
 * Renders a user-supplied question or answer body into the HTML consumed by
 * `dangerouslySetInnerHTML` in QuestionDetail.
 *
 * The security boundary is:
 *   user content -> escapeHtml() -> the transformations below -> dangerouslySetInnerHTML
 *
 * The seven transformations are reproduced verbatim from the original inline
 * chain. They are deliberately NOT improved, so every existing quirk of the
 * rendering is preserved exactly - including the ordered-list rule never firing
 * and the heading being wrapped in a paragraph.
 *
 * Because escapeHtml runs first, no user-supplied markup survives. The only
 * tags that can reach the DOM are the ones emitted here: p, h3, code, pre, ol, li.
 */
export function renderQuestionBody(value: string): string {
  return escapeHtml(value)
    .replace(
      /## (.*)/g,
      '<h3 class="text-lg font-semibold mt-6 mb-3 text-gray-900">$1</h3>',
    )
    .replace(
      /```(\w+)?\n([\s\S]*?)```/g,
      '<pre class="bg-gray-100 p-4 rounded-lg overflow-x-auto my-4"><code class="text-sm">$2</code></pre>',
    )
    .replace(
      /`([^`]+)`/g,
      '<code class="bg-gray-100 px-2 py-1 rounded text-sm">$1</code>',
    )
    .replace(/\n\n/g, '</p><p class="mb-4">')
    .replace(/^/, '<p class="mb-4">')
    .replace(/$/, "</p>")
    .replace(
      /\n(\d+\. .*)/g,
      '<ol class="list-decimal list-inside my-4"><li>$1</li></ol>',
    );
}
