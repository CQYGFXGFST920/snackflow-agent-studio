import { readdirSync, readFileSync, lstatSync } from 'node:fs';
import { createHash } from 'node:crypto';

// Review aid, not a substitute for manual review or a dedicated secrets scanner.
const excluded = new Set(['node_modules', 'dist', '.git', '.wrangler', '.vinext', '.next', 'artifacts']);
const rules = {
  credential: /(?:pat_[A-Za-z0-9_-]{20,}|github_pat_[A-Za-z0-9_]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9_-]{20,}|AKIA[A-Z0-9]{16}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|Bearer\s+[A-Za-z0-9_.-]{25,})/g,
  email: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
  phone: /(?<![\d.])(?:\+?86[- ]?)?1[3-9]\d{9}(?![\d.])/g,
  devicePath: /(?:\/(?:Users|home)\/[A-Za-z0-9_.-]+|[A-Z]:\\Users\\[^\\\s]+)/g,
  privateProject: /(?:appgprj_[A-Za-z0-9]+|appgver_[A-Za-z0-9]+|appgdep_[A-Za-z0-9]+|[A-Za-z0-9.-]+\.chatgpt\.site)/g,
};
const files = [];
const findings = [];
function visit(dir = '.') {
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a,b)=>a.name.localeCompare(b.name))) {
    if (excluded.has(entry.name)) continue;
    const path = dir === '.' ? entry.name : `${dir}/${entry.name}`;
    if (entry.isDirectory()) { visit(path); continue; }
    if (entry.isSymbolicLink()) throw new Error(`Unexpected symlink: ${path}`);
    if (path.endsWith('.tsbuildinfo')) continue;
    if ((entry.name.startsWith('.env') && entry.name !== '.env.example') || entry.name.startsWith('.dev.vars') || /\.(?:zip|tar|gz|sqlite|sqlite3|db|pem|key|p12|pfx|log)$/.test(path)) throw new Error(`Excluded private/generated file present: ${path}`);
    const buffer = readFileSync(path);
    const text = buffer.toString('utf8');
    let metadata = text;
    if (path.endsWith('.png')) {
      const chunks = [];
      for (let offset = 8; offset + 12 <= buffer.length;) {
        const length = buffer.readUInt32BE(offset);
        const type = buffer.toString('ascii', offset + 4, offset + 8);
        if (offset + length + 12 > buffer.length) throw new Error(`Malformed PNG: ${path}`);
        if (!['IHDR', 'IDAT', 'IEND'].includes(type)) chunks.push(buffer.subarray(offset + 8, offset + 8 + length));
        offset += length + 12;
      }
      metadata = Buffer.concat(chunks).toString('utf8');
    }
    for (const [category, rule] of Object.entries(rules)) {
      rule.lastIndex = 0;
      // Scan PNG metadata, not compressed pixel bytes, for contact/path patterns.
      if (rule.test(category === 'credential' ? text : metadata)) findings.push({ path, category });
    }
    const exactSecret = process.env.COZE_WORKLOAD_IDENTITY_API_KEY;
    if (exactSecret && text.includes(exactSecret)) findings.push({ path, category: 'exactSecret' });
    files.push({ path, bytes: lstatSync(path).size, sha256: createHash('sha256').update(buffer).digest('hex') });
  }
}
visit();
if (process.argv.includes('--paths')) console.log(files.map(f=>f.path).join('\n'));
else console.log(JSON.stringify({ fileCount: files.length, findings, files }, null, 2));
if (findings.length) process.exitCode = 1;
