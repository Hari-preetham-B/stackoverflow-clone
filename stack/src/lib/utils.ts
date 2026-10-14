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
