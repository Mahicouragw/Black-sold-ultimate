import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const require = createRequire(import.meta.url);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg'
};

const server = http.createServer(async (req, res) => {
  let url;try{url=new URL(req.url,'http://preview.invalid');url.pathname=decodeURIComponent(url.pathname);}catch{res.writeHead(400);return res.end('Bad request');}
  if(url.pathname.split('/').some(x=>x.startsWith('.')||x.includes('\\'))){res.writeHead(404);return res.end('Not found');}

  if (['/api/translate','/api/npc'].includes(url.pathname) && req.method === 'POST') {
    let body = '';
    let tooLarge=false;
    req.on('data', chunk => { if(tooLarge)return;body+=chunk;if(Buffer.byteLength(body)>16384){tooLarge=true;res.writeHead(413);res.end('Request too large');} });
    req.on('end', async () => {
      if(tooLarge)return;req.body = body;
      try {
        const handler = require(path.join(rootDir, 'api', url.pathname==='/api/npc'?'npc.js':'translate.js'));
        await handler(req, res);
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Request unavailable' }));
      }
    });
    return;
  }

  if(!['GET','HEAD'].includes(req.method)||['api','lib','scripts','tests','supabase','node_modules','android','ios','.git'].includes(url.pathname.split('/')[1])){res.writeHead(404);return res.end('Not found');}
  let filePath = path.join(rootDir, url.pathname === '/' ? 'index.html' : url.pathname);
  if (!fs.existsSync(filePath) && fs.existsSync(path.join(rootDir, 'www', url.pathname))) {
    filePath = path.join(rootDir, 'www', url.pathname);
  }

  if(!path.resolve(filePath).startsWith(rootDir+path.sep)||!MIME_TYPES[path.extname(filePath)]){res.writeHead(404);return res.end('Not found');}
  try{if(!fs.realpathSync(filePath).startsWith(rootDir+path.sep)){res.writeHead(404);return res.end('Not found');}}catch{res.writeHead(404);return res.end('Not found');}
  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(3000, '0.0.0.0', () => {
  console.log('Black Sword Ultimate dev server running at http://0.0.0.0:3000');
});
