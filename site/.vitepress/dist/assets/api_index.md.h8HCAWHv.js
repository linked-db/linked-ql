import { _ as _export_sfc, o as openBlock, c as createElementBlock, ag as createStaticVNode } from "./chunks/framework.DNT4b13o.js";
const __pageData = JSON.parse('{"title":"API","description":"","frontmatter":{},"headers":[],"relativePath":"api/index.md","filePath":"api/index.md"}');
const _sfc_main = { name: "api/index.md" };
function _sfc_render(_ctx, _cache, $props, $setup, $data, $options) {
  return openBlock(), createElementBlock("div", null, [..._cache[0] || (_cache[0] = [
    createStaticVNode('<h1 id="api" tabindex="-1">API <a class="header-anchor" href="#api" aria-label="Permalink to &quot;API&quot;">​</a></h1><p>LinkedQL keeps the application-facing contract stable across its runtimes.</p><p>The core API surface is:</p><ul><li><a href="/api/query"><code>db.query()</code></a></li><li><a href="/api/stream"><code>db.stream()</code></a></li><li><a href="/api/transaction"><code>db.transaction()</code></a></li><li><a href="/api/wal-subscribe"><code>db.wal.subscribe()</code></a></li></ul><p>Use this section for method-by-method reference. For conceptual behavior, see:</p><ul><li><a href="/lang/">Language</a></li><li><a href="/realtime/">Realtime</a></li><li><a href="/guides/">Guides</a></li></ul>', 6)
  ])]);
}
const index = /* @__PURE__ */ _export_sfc(_sfc_main, [["render", _sfc_render]]);
export {
  __pageData,
  index as default
};
