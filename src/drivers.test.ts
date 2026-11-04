import { describe, expect, it } from 'vitest';
import { NodeTTYDriver, NodePtyDriver, TTYSessionManager, collectOutput } from './index';

describe('standalone interactive process drivers', () => {
    it('spawns immediately, accepts input and removes the exited pipe session', async () => {
        const manager = new TTYSessionManager();
        const session = new NodeTTYDriver().spawn(process.execPath, ['-e',
            'process.stdin.once("data", data => { process.stdout.write("answer:" + data); process.exit(0); });']);
        try {
            manager.add(session);
            expect(manager.get(session.id)).toBe(session);
            const result = collectOutput(session, { idleTimeoutMs: 3_000 });
            session.write('selected\n');
            expect(await result).toMatchObject({ output: 'answer:selected\n', exited: true, exitCode: 0 });
            expect(manager.list()).toEqual([]);
        } finally { session.kill('SIGKILL'); }
    });

    it('starts a real PTY immediately and accepts an interactive response', async () => {
        const driver = new NodePtyDriver();
        const session = driver.spawn(process.execPath, ['-e',
            'process.stdout.write("tty=" + process.stdin.isTTY + "\\n"); process.stdin.once("data", () => process.exit(0));']);
        try {
            expect(driver.supportsPty).toBe(true);
            session.resize(80, 24);
            const result = collectOutput(session, { idleTimeoutMs: 3_000 });
            session.write('selected\r');
            const output = await result;
            expect(output.output).toContain('tty=true');
            expect(output).toMatchObject({ exited: true, exitCode: 0 });
        } finally { session.kill('SIGKILL'); }
    });

    it('reports an actual spawn failure through the error event', async () => {
        const session = new NodeTTYDriver().spawn('/definitely-missing-device-tty-command', []);
        const failure = new Promise<Error>(resolve => session.on('error', resolve));
        expect(await failure).toMatchObject({ code: 'ENOENT' });
        expect(session.exited).toBe(true);
        expect((await collectOutput(session)).exited).toBe(true);
    });

    it('honors an already aborted collector signal and terminates the child', async () => {
        const session = new NodeTTYDriver().spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)']);
        const exit = new Promise<void>(resolve => session.on('exit', () => resolve()));
        const controller = new AbortController();
        controller.abort();
        try {
            await collectOutput(session, { signal: controller.signal });
            await exit;
            expect(session.exited).toBe(true);
        } finally { session.kill('SIGKILL'); }
    });
});
