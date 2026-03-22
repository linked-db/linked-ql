import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import v8toIstanbul from 'v8-to-istanbul';

const cwd = process.cwd();
const coverageDir = path.join(cwd, '.coverage');
const reportDir = path.join(cwd, 'coverage');
const reportPath = path.join(reportDir, 'lcov.info');
const sourceRoot = path.join(cwd, 'src') + path.sep;

if (!fs.existsSync(coverageDir)) {
    throw new Error(`Coverage directory not found: ${coverageDir}`);
}

const coverageFiles = fs.readdirSync(coverageDir)
    .filter((name) => name.endsWith('.json'))
    .map((name) => path.join(coverageDir, name));

if (!coverageFiles.length) {
    throw new Error(`No V8 coverage files found in ${coverageDir}`);
}

const merged = new Map();

for (const file of coverageFiles) {
    const payload = JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const entry of payload.result || []) {
        if (!String(entry.url || '').startsWith('file://')) continue;

        const filename = fileURLToPath(entry.url);
        if (!filename.startsWith(sourceRoot)) continue;
        if (!fs.existsSync(filename)) continue;

        const converter = v8toIstanbul(filename, 0, {
            source: fs.readFileSync(filename, 'utf8'),
        });
        await converter.load();
        converter.applyCoverage(entry.functions || []);

        const coverage = converter.toIstanbul()[filename];
        if (!coverage) continue;

        if (!merged.has(filename)) {
            merged.set(filename, coverage);
            continue;
        }

        const target = merged.get(filename);

        for (const [id, count] of Object.entries(coverage.s)) {
            target.s[id] = (target.s[id] || 0) + count;
        }
        for (const [id, count] of Object.entries(coverage.f)) {
            target.f[id] = (target.f[id] || 0) + count;
        }
        for (const [id, counts] of Object.entries(coverage.b)) {
            const current = target.b[id] || [];
            target.b[id] = counts.map((count, index) => (current[index] || 0) + count);
        }
    }
}

const linesFor = (coverage) => {
    const counts = new Map();
    for (const [id, loc] of Object.entries(coverage.statementMap)) {
        const line = loc.start.line;
        const count = coverage.s[id] || 0;
        counts.set(line, Math.max(counts.get(line) || 0, count));
    }
    return [...counts.entries()].sort((a, b) => a[0] - b[0]);
};

const lcov = [];

for (const [filename, coverage] of [...merged.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    lcov.push('TN:');
    lcov.push(`SF:${filename}`);

    let fnFound = 0;
    let fnHit = 0;
    for (const [id, meta] of Object.entries(coverage.fnMap)) {
        const name = meta.name || `(anonymous_${id})`;
        const line = meta.loc?.start.line || meta.line || 1;
        const count = coverage.f[id] || 0;
        lcov.push(`FN:${line},${name}`);
        lcov.push(`FNDA:${count},${name}`);
        fnFound += 1;
        if (count > 0) fnHit += 1;
    }
    lcov.push(`FNF:${fnFound}`);
    lcov.push(`FNH:${fnHit}`);

    const lines = linesFor(coverage);
    for (const [line, count] of lines) {
        lcov.push(`DA:${line},${count}`);
    }
    lcov.push(`LF:${lines.length}`);
    lcov.push(`LH:${lines.filter(([, count]) => count > 0).length}`);

    let brFound = 0;
    let brHit = 0;
    for (const [id, meta] of Object.entries(coverage.branchMap || {})) {
        const counts = coverage.b[id] || [];
        const line = meta.loc?.start.line || meta.line || 1;
        counts.forEach((count, index) => {
            lcov.push(`BRDA:${line},${id},${index},${count > 0 ? count : '-'}`);
            brFound += 1;
            if (count > 0) brHit += 1;
        });
    }
    lcov.push(`BRF:${brFound}`);
    lcov.push(`BRH:${brHit}`);
    lcov.push('end_of_record');
}

fs.mkdirSync(reportDir, { recursive: true });
fs.writeFileSync(reportPath, lcov.join('\n') + '\n');
console.log(`Wrote ${path.relative(cwd, reportPath)}`);
