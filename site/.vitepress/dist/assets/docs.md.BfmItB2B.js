import { v as onMounted, o as openBlock, c as createElementBlock, ag as createStaticVNode } from "./chunks/framework.DNT4b13o.js";
const __pageData = JSON.parse('{"title":"Docs Moved","description":"","frontmatter":{},"headers":[],"relativePath":"docs.md","filePath":"docs.md"}');
const __default__ = { name: "docs.md" };
const _sfc_main = /* @__PURE__ */ Object.assign(__default__, {
  setup(__props) {
    onMounted(() => {
      if (typeof window !== "undefined" && !window.location.hash) {
        window.location.replace("/guides/");
      }
    });
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", null, [..._cache[0] || (_cache[0] = [
        createStaticVNode('<h1 id="docs-moved" tabindex="-1">Docs Moved <a class="header-anchor" href="#docs-moved" aria-label="Permalink to &quot;Docs Moved&quot;">​</a></h1><p>The main docs entry point is now <a href="/guides/">Guides</a>.</p><p>If you arrived here from an older link:</p><ul><li><a href="/guides/">Guides</a></li><li><a href="/api/">API</a></li><li><a href="/lang/">Language</a></li><li><a href="/realtime/">Realtime</a></li></ul>', 4)
      ])]);
    };
  }
});
export {
  __pageData,
  _sfc_main as default
};
