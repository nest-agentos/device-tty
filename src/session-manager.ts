// @file: device-tty/src/session-manager.ts
// TTY session registry — tracks active sessions across tool calls.

import type { ITTYSession, ITTYSessionManager } from './contracts';

export class TTYSessionManager implements ITTYSessionManager {
    private sessions = new Map<string, ITTYSession>();

    add(session: ITTYSession): void {
        this.sessions.set(session.id, session);
        // Auto-remove when process exits
        const unsub = session.on('exit', () => {
            this.sessions.delete(session.id);
            unsub();
        });
    }

    get(id: string): ITTYSession | undefined {
        return this.sessions.get(id);
    }

    remove(id: string): void {
        const session = this.sessions.get(id);
        session?.kill();
        this.sessions.delete(id);
    }

    abortAll(): void {
        for (const s of this.sessions.values()) s.kill();
        this.sessions.clear();
    }

    list(): Array<{ id: string; command: string; pid: number | undefined; exited: boolean }> {
        return [...this.sessions.values()].map(s => ({
            id:      s.id,
            command: s.command,
            pid:     s.pid,
            exited:  s.exited,
        }));
    }
}

// ── Shared output collector ───────────────────────────────────────────────────

type CollectOptions = { idleTimeoutMs?: number; maxBytes?: number; signal?: AbortSignal };
type CollectedOutput = { output: string; exited: boolean; exitCode: number | null; truncated: boolean };

/** Collect live output until exit, idle, the output limit or cancellation. */
export function collectOutput(session: ITTYSession, options: CollectOptions = {}): Promise<CollectedOutput> {
    return new Promise(resolve => new OutputCollector(session, options, resolve).start());
}

class OutputCollector {
    private readonly chunks: string[] = [];
    private readonly unsubs: Array<() => void> = [];
    private totalBytes = 0;
    private timer: ReturnType<typeof setTimeout> | undefined;
    private done = false;
    private readonly onAbort = (): void => { this.session.kill(); this.finish(); };

    constructor(
        private readonly session: ITTYSession,
        private readonly options: CollectOptions,
        private readonly resolve: (output: CollectedOutput) => void,
    ) {}

    start(): void {
        this.unsubs.push(this.session.on('data', chunk => this.receive(chunk)));
        this.unsubs.push(this.session.on('exit', () => this.finish()));
        this.unsubs.push(this.session.on('error', error => {
            this.chunks.push(`\n[error: ${error.message}]`);
            this.finish();
        }));
        this.options.signal?.addEventListener('abort', this.onAbort, { once: true });
        if (this.options.signal?.aborted) this.onAbort();
        else if (this.session.exited) this.finish();
        else this.resetIdle();
    }

    private receive(chunk: string): void {
        this.chunks.push(chunk);
        this.totalBytes += chunk.length;
        if (this.totalBytes >= (this.options.maxBytes ?? 50_000)) {
            this.chunks.push('\n[output truncated]');
            this.finish(true);
        } else this.resetIdle();
    }

    private resetIdle(): void {
        if (this.timer) clearTimeout(this.timer);
        this.timer = setTimeout(() => this.finish(), this.options.idleTimeoutMs ?? 1_500);
    }

    private finish(truncated = false): void {
        if (this.done) return;
        this.done = true;
        if (this.timer) clearTimeout(this.timer);
        for (const unsubscribe of this.unsubs) unsubscribe();
        this.options.signal?.removeEventListener('abort', this.onAbort);
        this.resolve({ output: this.chunks.join(''), exited: this.session.exited,
            exitCode: this.session.exitCode, truncated });
    }
}
