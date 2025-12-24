/**
 * OAuth Callback Server
 *
 * Temporary HTTP server for handling OAuth callbacks on localhost.
 */

import { createServer, IncomingMessage, ServerResponse } from 'http';
import { parse as parseUrl } from 'url';

/**
 * OAuth callback result
 */
export interface CallbackResult {
  code?: string;
  error?: string;
  errorDescription?: string;
}

/**
 * Start a temporary HTTP server to handle OAuth callback
 * Returns a promise that resolves when the callback is received
 */
export function startCallbackServer(
  port: number = 3000,
  timeoutMs: number = 300000 // 5 minutes
): Promise<CallbackResult> {
  return new Promise((resolve, reject) => {
    let server: ReturnType<typeof createServer> | null = null;
    let resolved = false;

    // Timeout handler
    const timeout = setTimeout(() => {
      if (!resolved && server) {
        server.close();
        reject(new Error('OAuth callback timeout (5 minutes)'));
      }
    }, timeoutMs);

    // Request handler
    const handleRequest = (req: IncomingMessage, res: ServerResponse) => {
      const url = parseUrl(req.url || '', true);

      // Only handle the callback path
      if (url.pathname !== '/oauth/callback') {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not found');
        return;
      }

      const query = url.query;
      const code = query.code as string | undefined;
      const error = query.error as string | undefined;
      const errorDescription = query.error_description as string | undefined;

      // Send response to browser
      if (error) {
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end(`
          <!DOCTYPE html>
          <html>
            <head>
              <title>Authorization Failed</title>
              <style>
                body { font-family: system-ui; padding: 40px; max-width: 600px; margin: 0 auto; }
                .error { background: #fee; border: 1px solid #fcc; border-radius: 4px; padding: 20px; }
                h1 { color: #c00; margin-top: 0; }
                code { background: #f5f5f5; padding: 2px 6px; border-radius: 3px; }
              </style>
            </head>
            <body>
              <div class="error">
                <h1>Authorization Failed</h1>
                <p><strong>Error:</strong> <code>${error}</code></p>
                ${errorDescription ? `<p><strong>Description:</strong> ${errorDescription}</p>` : ''}
                <p>You can close this window and try again.</p>
              </div>
            </body>
          </html>
        `);

        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          server?.close();
          resolve({ error, errorDescription });
        }
      } else if (code) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <!DOCTYPE html>
          <html>
            <head>
              <title>Authorization Successful</title>
              <style>
                body { font-family: system-ui; padding: 40px; max-width: 600px; margin: 0 auto; }
                .success { background: #efe; border: 1px solid #cfc; border-radius: 4px; padding: 20px; }
                h1 { color: #080; margin-top: 0; }
              </style>
            </head>
            <body>
              <div class="success">
                <h1>✓ Authorization Successful</h1>
                <p>You have successfully authorized IntentMail to access your Gmail account.</p>
                <p>You can close this window and return to the terminal.</p>
              </div>
            </body>
          </html>
        `);

        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          server?.close();
          resolve({ code });
        }
      } else {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('Missing authorization code or error');
      }
    };

    // Create and start server
    try {
      server = createServer(handleRequest);

      server.on('error', (err) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          reject(err);
        }
      });

      server.listen(port, 'localhost', () => {
        console.error(`OAuth callback server listening on http://localhost:${port}/oauth/callback`);
      });
    } catch (err) {
      clearTimeout(timeout);
      reject(err);
    }
  });
}
