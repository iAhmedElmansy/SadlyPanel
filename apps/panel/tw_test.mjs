import { compile } from 'tailwindcss';
import fs from 'node:fs/promises';
import path from 'node:path';
const css = await compile('@import "tailwindcss";', { base: process.cwd(), loadStylesheet: async () => {
  const p = path.join(process.cwd(), 'node_modules/tailwindcss/index.css');
  return { base: path.dirname(p), content: await fs.readFile(p, 'utf8'), path: p };
}});
const out = css.build(['size-4', 'size-4.5', 'size-5']);
for (const cls of ['size-4', 'size-4\\.5', 'size-5']) {
  const re = new RegExp('\\.' + cls + '\\s*\\{[^}]*\\}');
  const m = out.match(re);
  console.log(cls, '=>', m ? m[0] : 'NOT GENERATED');
}
