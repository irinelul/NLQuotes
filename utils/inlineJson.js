// JSON.stringify output is not safe to drop into an inline <script>: a string
// containing "</script>" closes the tag early and whatever follows runs as
// HTML. Escaping "<" as < keeps the JSON value identical while making it
// impossible to close the tag (or open a comment). U+2028/U+2029 are escaped
// too — valid in JSON, but line terminators in older JS parsers.
export function inlineJson(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}
