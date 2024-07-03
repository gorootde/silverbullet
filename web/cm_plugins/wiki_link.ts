import { ClickEvent } from "$sb/types.ts";
import { syntaxTree } from "@codemirror/language";
import { Decoration } from "@codemirror/view";
import { Client } from "../client.ts";
import { decoratorStateField, isCursorInRange, LinkWidget } from "./util.ts";
import { resolvePath } from "$sb/lib/resolve.ts";
import { encodePageRef, parsePageRef } from "$sb/lib/page_ref.ts";

/**
 * Plugin to hide path prefix when the cursor is not inside.
 */
export function cleanWikiLinkPlugin(client: Client) {
  return decoratorStateField((state) => {
    const widgets: any[] = [];
    // let parentRange: [number, number];
    const allKnownFiles = client.clientSystem.allKnownFiles;
    syntaxTree(state).iterate({
      enter: ({ type, from, to }) => {
        if (type.name !== "WikiLink") {
          return;
        }
        const text = state.sliceDoc(from, to);
        const match = /(!?\[\[)([^\]\|]+)(?:\|([^\]]+))?(\]\])/g.exec(text);

        if (!match) return;
        const [_fullMatch, firstMark, url, alias, lastMark] = match;

        if (firstMark.startsWith("!")) {
          // Is inline image
          return;
        }

        let fileExists = !client.fullSyncCompleted;

        const pageRef = parsePageRef(url);
        pageRef.page = resolvePath(client.currentPage, "/" + pageRef.page);
        const lowerCasePageName = pageRef.page.toLowerCase();

        for (const fileName of allKnownFiles) {
          if (
            fileName.toLowerCase().replace(/\.md$/, "") === lowerCasePageName
          ) {
            fileExists = true;
            break;
          }
        }
        if (
          pageRef.page === "" ||
          client.plugSpaceRemotePrimitives.isLikelyHandled(pageRef.page)
        ) {
          // Empty page name with local @anchor use or a link to a page that dynamically generated by a plug
          fileExists = true;
        }

        if (isCursorInRange(state, [from, to])) {
          // Only attach a CSS class, then get out
          if (!fileExists) {
            widgets.push(
              Decoration.mark({
                class: "sb-wiki-link-page-missing",
              }).range(
                from + firstMark.length,
                to - lastMark.length,
              ),
            );
          }
          return;
        }

        const linkText = alias ||
          (url.includes("/") ? url.split("/").pop()! : url);

        // And replace it with a widget
        widgets.push(
          Decoration.replace({
            widget: new LinkWidget(
              {
                text: linkText,
                title: fileExists
                  ? `Navigate to ${encodePageRef(pageRef)}`
                  : `Create ${pageRef.page}`,
                href: `/${encodePageRef(pageRef)}`,
                cssClass: fileExists
                  ? "sb-wiki-link-page"
                  : "sb-wiki-link-page-missing",
                callback: (e) => {
                  if (e.altKey) {
                    // Move cursor into the link
                    client.editorView.dispatch({
                      selection: { anchor: from + firstMark.length },
                    });
                    client.focus();
                    return;
                  }
                  // Dispatch click event to navigate there without moving the cursor
                  const clickEvent: ClickEvent = {
                    page: client.currentPage,
                    ctrlKey: e.ctrlKey,
                    metaKey: e.metaKey,
                    altKey: e.altKey,
                    pos: from,
                  };
                  client.dispatchAppEvent("page:click", clickEvent).catch(
                    console.error,
                  );
                },
              },
            ),
          }).range(from, to),
        );
      },
    });
    return Decoration.set(widgets, true);
  });
}
