import { readFileSync } from 'node:fs';
import { root } from '../release/common.mjs';
import { join } from 'node:path';

const escape = (value) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
const inline = (value) =>
  escape(value).replace(
    /\[([^\]]+)\]\((https:\/\/[^\s)]+)\)/g,
    '<a href="$2">$1</a>',
  );
export function policyHtml(name) {
  return readFileSync(join(root, name), 'utf8')
    .replaceAll('\r', '')
    .trim()
    .split(/\n\n+/)
    .map((block) => {
      if (/^#{1,3} /.test(block)) {
        const level = block.match(/^#+/)[0].length;
        return `<h${level}>${inline(block.replace(/^#+ /, ''))}</h${level}>`;
      }
      if (block.startsWith('- '))
        return `<ul>${block
          .split(/\n(?=- )/)
          .map(
            (item) =>
              `<li>${inline(item.replace(/^- /, '').replaceAll('\n', ' '))}</li>`,
          )
          .join('')}</ul>`;
      return `<p>${inline(block.replaceAll('\n', ' '))}</p>`;
    })
    .join('\n');
}
