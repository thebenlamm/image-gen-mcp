import type { Request, Response, NextFunction } from 'express';

/**
 * DNS-rebinding guard for the SSE transport.
 *
 * The SSE server binds to 127.0.0.1, but a web page can still reach it via
 * DNS rebinding (attacker hostname re-resolved to 127.0.0.1). Such requests
 * carry the attacker's hostname in `Host` and the page's `Origin`, so we
 * reject any request whose Host is not a loopback name for our port, and any
 * request that carries a non-loopback Origin. Non-browser MCP clients send no
 * Origin and are unaffected.
 *
 * Applied to every route (the SDK's own enableDnsRebindingProtection only
 * covers POST /messages, not GET /sse or /health).
 */
export function loopbackHosts(port: number): string[] {
  return [`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`];
}

export function loopbackOrigins(port: number): string[] {
  return loopbackHosts(port).map((h) => `http://${h}`);
}

export function createLoopbackGuard(port: number) {
  const hosts = new Set(loopbackHosts(port));
  const origins = new Set(loopbackOrigins(port));
  return (req: Request, res: Response, next: NextFunction): void => {
    const host = req.headers.host;
    if (!host || !hosts.has(host)) {
      console.error(`SSE guard: rejected request with Host=${JSON.stringify(host)} ${req.method} ${req.path}`);
      res.status(403).json({ error: 'Forbidden host' });
      return;
    }
    const origin = req.headers.origin;
    if (origin !== undefined && !origins.has(origin)) {
      console.error(`SSE guard: rejected request with Origin=${JSON.stringify(origin)} ${req.method} ${req.path}`);
      res.status(403).json({ error: 'Forbidden origin' });
      return;
    }
    next();
  };
}
