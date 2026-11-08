import { excluded, maxDocumentLength } from './capture';

export function indexDocument() {
  const body = document.body;
  if (!body) return undefined;
  const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
  const nodes: { node: Text; start: number; end: number }[] = [];
  let text = '';
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.parentElement?.closest(excluded)) continue;
    const value = (node as Text).data;
    if (text.length + value.length > maxDocumentLength) return undefined;
    if (!value) continue;
    const start = text.length;
    text += value;
    nodes.push({ node: node as Text, start, end: text.length });
  }

  return { nodes, text };
}
