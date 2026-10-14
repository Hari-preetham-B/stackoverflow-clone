import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { escapeHtml, renderQuestionBody } from "../utils.ts";

/**
 * XSS regression + rendering-fidelity tests for the question/answer pipeline.
 *
 * The security boundary under test is:
 *   user content -> escapeHtml() -> seven Markdown transforms -> dangerouslySetInnerHTML
 *
 * These are pure string tests. No browser is involved, no payload is executed,
 * and nothing connects to MongoDB, SMTP, Twilio or Razorpay.
 *
 * QuestionDetail.tsx is deliberately NOT imported: it is a .tsx file containing
 * JSX, which Node cannot load. renderQuestionBody() is the exact function the
 * component now calls, so testing it here tests the real rendering path.
 */

/** Tags the renderer itself is allowed to emit. */
const ALLOWED_TAGS = new Set(["p", "h3", "code", "pre", "ol", "li"]);

/**
 * Scans for REAL tags only - "<name attr=...>". Escaped text such as
 * "&lt;img" is not a tag, because there is no literal "<" before the name.
 */
const scanTags = (html: string) => {
  const tags: { name: string; attrs: string }[] = [];
  const re = /<\/?([a-zA-Z][a-zA-Z0-9]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    tags.push({ name: m[1].toLowerCase(), attrs: m[2] || "" });
  }
  return tags;
};

/**
 * Asserts that a payload rendered through the real pipeline cannot execute:
 * no tag outside the allowlist, no event-handler attribute, no javascript: URL.
 */
const assertNotExecutable = (html: string, label: string) => {
  const tags = scanTags(html);
  const disallowed = tags.filter((t) => !ALLOWED_TAGS.has(t.name));
  const eventHandlers = tags.filter((t) => /\bon\w+\s*=/i.test(t.attrs));
  const jsUrls = tags.filter((t) => /javascript\s*:/i.test(t.attrs));

  assert.deepEqual(
    disallowed.map((t) => t.name),
    [],
    `${label}: user content produced a non-allowlisted tag`,
  );
  assert.deepEqual(eventHandlers, [], `${label}: an on* event handler was generated`);
  assert.deepEqual(jsUrls, [], `${label}: a javascript: URL was generated as markup`);
};

const XSS_PAYLOADS: [string, string][] = [
  ["<script>alert(1)</script>", "script tag"],
  ["<img src=x onerror=alert(1)>", "image onerror handler"],
  ["<svg onload=alert(1)>", "svg onload handler"],
  ['<iframe src="javascript:alert(1)"></iframe>', "iframe with javascript URL"],
  ['<a href="javascript:alert(1)">click</a>', "anchor with javascript URL"],
  ["<ScRiPt>alert(1)</ScRiPt>", "mixed-case script tag"],
  ["<img src=x onerror\n=alert(1)>", "newline-split event handler"],
  ["<math><mtext><table><mglyph><style><!--</style><img src=x onerror=alert(1)>", "mXSS namespace-confusion"],
  ["<body onload=alert(1)>", "body onload"],
  ["<div onmouseover=alert(1)>hover</div>", "event handler on div"],
  ["<style>*{background:url(javascript:alert(1))}</style>", "style block"],
  ["<object data=javascript:alert(1)>", "object data URL"],
  ["<form action=javascript:alert(1)>", "form action URL"],
  ["<input onfocus=alert(1) autofocus>", "autofocus event handler"],
  ["<link rel=stylesheet href=javascript:alert(1)>", "link stylesheet"],
];

// ---------------------------------------------------------------------------
// P0 - XSS regression through renderQuestionBody
// ---------------------------------------------------------------------------

describe("XSS regression: renderQuestionBody", () => {
  for (const [payload, label] of XSS_PAYLOADS) {
    test(`neutralises ${label}`, () => {
      const html = renderQuestionBody(payload);

      assertNotExecutable(html, label);

      // The payload's own "<" must never survive as a literal character.
      assert.equal(
        html.includes("<" + payload[1]),
        false,
        `${label}: a literal "<${payload[1]}" survived escaping`,
      );
    });
  }
});

describe("XSS regression: the pipeline output contains only renderer tags", () => {
  test("a payload wrapped in markdown still yields only allowlisted tags", () => {
    const html = renderQuestionBody(
      ["## Heading", "", "<img src=x onerror=alert(1)>", "", "`code`"].join("\n"),
    );
    assertNotExecutable(html, "markdown + payload");
    assert.ok(html.includes("<h3"), "heading still renders");
  });

  test("a payload inside a fenced code block yields only allowlisted tags", () => {
    const html = renderQuestionBody(["```html", "<script>alert(1)</script>", "```"].join("\n"));
    assertNotExecutable(html, "fenced code + payload");
  });
});

// ---------------------------------------------------------------------------
// escapeHtml invariants
// ---------------------------------------------------------------------------

describe("escapeHtml invariants", () => {
  test("escapes <", () => {
    assert.equal(escapeHtml("<"), "&lt;");
  });
  test("escapes >", () => {
    assert.equal(escapeHtml(">"), "&gt;");
  });
  test('escapes "', () => {
    assert.equal(escapeHtml('"'), "&quot;");
  });
  test("escapes '", () => {
    assert.equal(escapeHtml("'"), "&#39;");
  });
  test("escapes &", () => {
    assert.equal(escapeHtml("&"), "&amp;");
  });
  test("literal &amp; becomes &amp;amp; (single-pass, no double-escaping of & itself)", () => {
    assert.equal(escapeHtml("&amp;"), "&amp;amp;");
  });
  test("returns an empty string for empty input", () => {
    assert.equal(escapeHtml(""), "");
  });
  test("returns an empty string for null", () => {
    assert.equal(escapeHtml(null as unknown as string), "");
  });
  test("returns an empty string for undefined", () => {
    assert.equal(escapeHtml(undefined as unknown as string), "");
  });
  test("never leaves a raw <, >, \" or ' in the output", () => {
    const dirty = `<a href="x" title='y'> & </a>`;
    assert.equal(/[<>"']/.test(escapeHtml(dirty)), false);
  });
});

// ---------------------------------------------------------------------------
// Rendering fidelity - behaviour that already existed must not regress
// ---------------------------------------------------------------------------

describe("rendering fidelity (existing behaviour preserved)", () => {
  test("## heading produces the existing <h3> markup", () => {
    assert.ok(
      renderQuestionBody("## My Heading").includes(
        '<h3 class="text-lg font-semibold mt-6 mb-3 text-gray-900">My Heading</h3>',
      ),
    );
  });

  test("inline code produces the existing <code> markup", () => {
    assert.ok(
      renderQuestionBody("use `npm test` here").includes(
        '<code class="bg-gray-100 px-2 py-1 rounded text-sm">npm test</code>',
      ),
    );
  });

  test("fenced code produces the existing <pre>/<code> markup", () => {
    const html = renderQuestionBody(["```javascript", "const x = 1;", "```"].join("\n"));
    assert.ok(html.includes('<pre class="bg-gray-100 p-4 rounded-lg overflow-x-auto my-4">'));
    assert.ok(html.includes('<code class="text-sm">const x = 1;'));
  });

  test("content is wrapped in the existing paragraph markup", () => {
    assert.ok(renderQuestionBody("plain text").startsWith('<p class="mb-4">'));
    assert.ok(renderQuestionBody("plain text").endsWith("</p>"));
  });

  test("blank lines split paragraphs using the existing rule", () => {
    assert.ok(renderQuestionBody("one\n\ntwo").includes('</p><p class="mb-4">'));
  });

  test("user-supplied < and && stay visible as escaped text", () => {
    const html = renderQuestionBody(["```js", "const x = 1 < 2 && 3 > 2;", "```"].join("\n"));
    assert.ok(html.includes("1 &lt; 2 &amp;&amp; 3 &gt; 2;"), "code content must display escaped");
  });

  test("empty input still produces the paragraph wrapper", () => {
    // Documents the existing behaviour rather than asserting an improvement.
    assert.equal(renderQuestionBody(""), '<p class="mb-4"></p>');
  });
});