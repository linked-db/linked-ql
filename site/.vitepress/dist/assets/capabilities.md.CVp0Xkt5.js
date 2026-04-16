import { v as onMounted, o as openBlock, c as createElementBlock, ag as createStaticVNode } from "./chunks/framework.DNT4b13o.js";
const __pageData = JSON.parse('{"title":"Capabilities Moved","description":"","frontmatter":{},"headers":[],"relativePath":"capabilities.md","filePath":"capabilities.md"}');
const __default__ = { name: "capabilities.md" };
const _sfc_main = /* @__PURE__ */ Object.assign(__default__, {
  setup(__props) {
    onMounted(() => {
      if (typeof window !== "undefined") {
        window.location.replace("/lang/");
      }
    });
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", null, [..._cache[0] || (_cache[0] = [
        createStaticVNode('<h1 id="capabilities-moved" tabindex="-1">Capabilities Moved <a class="header-anchor" href="#capabilities-moved" aria-label="Permalink to &quot;Capabilities Moved&quot;">​</a></h1><p>The old capabilities section has been split into:</p><ul><li><a href="/lang/">Language</a></li><li><a href="/realtime/">Realtime</a></li><li><a href="/guides/">Guides</a></li></ul>', 3)
      ])]);
    };
  }
});
export {
  __pageData,
  _sfc_main as default
};
