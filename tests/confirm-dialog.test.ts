import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ConfirmDialog } from "../components/ConfirmDialog.tsx";

test("confirm dialog renders a branded modal instead of a browser popup", () => {
  const html = renderToStaticMarkup(
    createElement(ConfirmDialog, {
      open: true,
      title: "Delete product",
      description: "This action cannot be undone.",
      confirmText: "Delete",
      cancelText: "Cancel",
      onConfirm: () => {},
      onCancel: () => {},
    }),
  );

  assert.match(html, /Delete product/);
  assert.match(html, /This action cannot be undone\./);
  assert.match(html, /Delete/);
  assert.match(html, /Cancel/);
  assert.doesNotMatch(html, /window\.confirm|confirm\(/i);
});
