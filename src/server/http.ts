import type { IncomingMessage, ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const MIME_TYPES: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml; charset=utf-8',
};

export function sendJson(response: ServerResponse, statusCode: number, payload: unknown): void {
  response.writeHead(statusCode, {
    'Content-Type': MIME_TYPES['.json'],
    'Cache-Control': 'no-store',
  });
  response.end(JSON.stringify(payload));
}

export function sendText(response: ServerResponse, statusCode: number, text: string): void {
  response.writeHead(statusCode, {
    'Content-Type': 'text/plain; charset=utf-8',
  });
  response.end(text);
}

export async function readJsonBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

export async function serveStaticFile(
  request: IncomingMessage,
  response: ServerResponse,
  publicDir: string,
  urlPath: string,
): Promise<void> {
  const filePath = resolveStaticPath(publicDir, urlPath);

  if (!filePath) {
    sendText(response, 404, 'Not found');
    return;
  }

  try {
    const content = await readFile(filePath);
    const extension = path.extname(filePath);
    response.writeHead(200, {
      'Content-Type': MIME_TYPES[extension] ?? 'application/octet-stream',
    });

    if (request.method === 'HEAD') {
      response.end();
      return;
    }

    response.end(content);
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      sendText(response, 404, 'Not found');
      return;
    }

    console.error(error);
    sendText(response, 500, 'Internal server error');
  }
}

function resolveStaticPath(publicDir: string, urlPath: string): string | null {
  const normalizedPath = path.normalize(urlPath);

  if (urlPath === '/') {
    return path.join(publicDir, 'index.html');
  }

  return resolveUnder(publicDir, normalizedPath.slice(1));
}

function resolveUnder(baseDir: string, subPath: string): string | null {
  const resolvedPath = path.resolve(baseDir, subPath);

  if (resolvedPath !== baseDir && !resolvedPath.startsWith(`${baseDir}${path.sep}`)) {
    return null;
  }

  return resolvedPath;
}
