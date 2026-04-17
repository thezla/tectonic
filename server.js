import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createPuzzle } from './src/shared/puzzle.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, 'public');
const sharedDir = path.join(__dirname, 'src', 'shared');

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml; charset=utf-8',
};

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'Content-Type': MIME_TYPES['.json'],
    'Cache-Control': 'no-store',
  });
  response.end(JSON.stringify(payload));
}

function sendText(response, statusCode, text) {
  response.writeHead(statusCode, {
    'Content-Type': 'text/plain; charset=utf-8',
  });
  response.end(text);
}

async function serveFile(request, response, filePath) {
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

function resolveUnder(baseDir, subPath) {
  const resolvedPath = path.resolve(baseDir, subPath);

  if (resolvedPath !== baseDir && !resolvedPath.startsWith(`${baseDir}${path.sep}`)) {
    return null;
  }

  return resolvedPath;
}

function resolveStaticPath(urlPath) {
  const normalizedPath = path.normalize(urlPath);

  if (urlPath === '/') {
    return path.join(publicDir, 'index.html');
  }

  if (urlPath.startsWith('/shared/')) {
    return resolveUnder(sharedDir, normalizedPath.replace(/^\/shared\//, ''));
  }

  return resolveUnder(publicDir, normalizedPath.slice(1));
}

const server = http.createServer(async (request, response) => {
  if (!request.url) {
    sendText(response, 400, 'Missing URL');
    return;
  }

  const requestUrl = new URL(request.url, 'http://localhost');

  if (requestUrl.pathname === '/api/puzzle') {
    sendJson(response, 200, createPuzzle());
    return;
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    sendText(response, 405, 'Method not allowed');
    return;
  }

  const filePath = resolveStaticPath(requestUrl.pathname);

  if (!filePath) {
    sendText(response, 404, 'Not found');
    return;
  }

  await serveFile(request, response, filePath);
});

const port = Number.parseInt(process.env.PORT ?? '3000', 10);

server.listen(port, () => {
  console.log(`Tectonic is running at http://localhost:${port}`);
});
