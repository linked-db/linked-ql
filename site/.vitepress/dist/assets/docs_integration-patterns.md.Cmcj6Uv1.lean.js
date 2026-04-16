import { v as onMounted, o as openBlock, c as createElementBlock, j as createBaseVNode, a as createTextVNode } from "./chunks/framework.DNT4b13o.js";
const __pageData = JSON.parse('{"title":"Page Moved","description":"","frontmatter":{},"headers":[],"relativePath":"docs/integration-patterns.md","filePath":"docs/integration-patterns.md"}');
const __default__ = { name: "docs/integration-patterns.md" };
const _sfc_main = /* @__PURE__ */ Object.assign(__default__, {
  setup(__props) {
    onMounted(() => {
      if (typeof window !== "undefined") {
        window.location.replace("/guides/integration-patterns");
      }
    });
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", null, [..._cache[0] || (_cache[0] = [
        createBaseVNode("h1", {
          id: "page-moved",
          tabindex: "-1"
        }, [
          createTextVNode("Page Moved "),
          createBaseVNode("a", {
            class: "header-anchor",
            href: "#page-moved",
            "aria-label": 'Permalink to "Page Moved"'
          }, "​")
        ], -1),
        createBaseVNode("p", null, [
          createTextVNode("This guide moved to "),
          createBaseVNode("a", { href: "/guides/integration-patterns" }, "Integration Patterns"),
          createTextVNode(".")
        ], -1)
      ])]);
    };
  }
});
export {
  __pageData,
  _sfc_main as default
};
