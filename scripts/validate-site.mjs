import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = fileURLToPath(new URL('../dist/', import.meta.url));
const failures = [];

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

function fail(message) {
  failures.push(message);
}

for (const file of ['robots.txt', 'sitemap.xml', 'llms.txt', 'webmcp.json', '404.html']) {
  if (!existsSync(join(dist, file))) fail(`Missing ${file}`);
}

JSON.parse(readFileSync(join(dist, 'webmcp.json'), 'utf8'));

const htmlFiles = walk(dist).filter((file) => file.endsWith('.html'));
const titles = new Set();
const descriptions = new Set();
const h1s = new Set();

for (const file of htmlFiles) {
  const html = readFileSync(file, 'utf8');
  const rel = file.slice(dist.length);
  const title = html.match(/<title>(.*?)<\/title>/s)?.[1]?.trim();
  const description = html.match(/<meta name="description" content="(.*?)"/s)?.[1]?.trim();
  const canonical = html.match(/<link rel="canonical" href="(.*?)"/s)?.[1]?.trim();
  const h1Count = (html.match(/<h1[\s>]/g) || []).length;
  const h1 = html.match(/<h1[^>]*>(.*?)<\/h1>/s)?.[1]?.replace(/<[^>]+>/g, '').trim();

  if (!title) fail(`${rel}: missing title`);
  if (!description) fail(`${rel}: missing meta description`);
  if (!canonical) fail(`${rel}: missing canonical`);
  if (h1Count !== 1) fail(`${rel}: expected exactly one H1, found ${h1Count}`);
  if (title && titles.has(title)) fail(`${rel}: duplicate title`);
  if (description && descriptions.has(description)) fail(`${rel}: duplicate meta description`);
  if (h1 && h1s.has(h1)) fail(`${rel}: duplicate H1`);
  if (title) titles.add(title);
  if (description) descriptions.add(description);
  if (h1) h1s.add(h1);

  for (const src of html.matchAll(/<img\b[^>]*>/g)) {
    if (!/\salt=/.test(src[0])) fail(`${rel}: image without alt`);
    if (!/\s(width|height)=/.test(src[0])) fail(`${rel}: image without reserved dimension`);
  }
}

const badUrls = htmlFiles
  .map((file) => file.slice(dist.length).replace(/index\.html$/, ''))
  .filter((path) => /[A-Z_\s\u4e00-\u9fff]/.test(path));

if (badUrls.length) fail(`Invalid URL paths: ${badUrls.join(', ')}`);

const contact = readFileSync(join(dist, 'contact-us/index.html'), 'utf8');
if (!contact.includes('data-webmcp-form="lead-capture"')) fail('Contact form missing WebMCP annotation');
if (!contact.includes('autocomplete="email"')) fail('Contact form missing email autocomplete');

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log(`Site validation passed for ${htmlFiles.length} HTML pages.`);
