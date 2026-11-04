import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { builtinModules } from 'node:module';
import ts from 'typescript';

const root = fileURLToPath(new URL('..', import.meta.url));
const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
assert.deepEqual(Object.keys(manifest.dependencies), ['node-pty']);
assert.ok(!manifest.peerDependencies && !manifest.optionalDependencies);
assert.deepEqual(Object.keys(manifest.exports).sort(), ['.', './contracts']);

function verifyTargets(value) {
    if (typeof value === 'string') assert.ok(existsSync(resolve(root, value)), `Missing artifact: ${value}`);
    else for (const entry of Object.values(value)) verifyTargets(entry);
}
verifyTargets(manifest.publishConfig.exports);

function files(directory) {
    return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
        const path = resolve(directory, entry.name);
        return entry.isDirectory() ? files(path) : /\.(?:[cm]?js|ts)$/.test(path) ? [path] : [];
    });
}

function imports(file) {
    const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
    const names = new Set();
    function visit(node) {
        const value = ts.isImportDeclaration(node) || ts.isExportDeclaration(node) ? node.moduleSpecifier
            : ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) ? node.argument.literal
            : ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword
                || ['require', 'requireNative'].includes(node.expression.getText(source))) ? node.arguments[0] : undefined;
        if (value && ts.isStringLiteralLike(value)) names.add(value.text);
        ts.forEachChild(node, visit);
    }
    visit(source);
    return names;
}

for (const directory of ['src', 'dist']) for (const file of files(resolve(root, directory))) {
    if (file.endsWith('.test.ts')) continue;
    for (const name of imports(file)) {
        if (name.startsWith('.')) assert.ok(resolve(dirname(file), name).startsWith(root), `Escaped package: ${name}`);
        else assert.ok(name === 'node-pty' || name.startsWith('node:') || builtinModules.includes(name), `Unexpected dependency: ${name}`);
    }
}
for (const extension of ['js', 'cjs', 'd.ts', 'd.cts']) {
    const path = resolve(root, `dist/contracts.${extension}`);
    assert.equal(imports(path).size, 0, `Contracts must load no runtime or application dependencies: ${path}`);
}
process.stdout.write('Independent device-tty artifacts depend only on Node builtins and node-pty; contracts are isolated.\n');
