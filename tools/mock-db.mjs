// Dev-only: a tiny stand-in for the Firebase Realtime Database REST API that enforces
// the same rules as firebase-rules.json (claim-once names, owner-only updates).
// Usage: node tools/mock-db.mjs [port]   then set localStorage 'kmr.dbOverride' to http://127.0.0.1:<port>
import http from 'node:http';

const port = Number(process.argv[2] ?? 9199);
const db = {owners: {}, stamp: {}, board: {}, grants: {}};
const ADMIN = 'kmr';
const GRANT_TYPES = ['add', 'remove', 'set', 'luck', 'reset', 'bonus'];
const NAME = /^[a-z0-9_]{3,12}$/;
const BOARD_KEYS = ['name', 'profit', 'balance', 'wagered', 'bets', 'wins', 'bestWin', 'bestMult', 'resets', 'joined', 'updated'];

function resolveSv(v, now) {
  if (v && typeof v === 'object') {
    if (v['.sv'] === 'timestamp') return now;
    const o = Array.isArray(v) ? [] : {};
    for (const [k, x] of Object.entries(v)) o[k] = resolveSv(x, now);
    return o;
  }
  return v;
}

function check(updates) {
  const now = Date.now();
  const res = resolveSv(updates, now);
  const owners = {...db.owners};
  const stamp = {...db.stamp};
  for (const [path, val] of Object.entries(res)) {
    const [top, name, ...rest] = path.split('/');
    if (top === 'grants') {
      if (rest.length !== 1) return 'bad grant path';
      continue;
    }
    if (rest.length) return 'deep paths not used by the app';
    if (top === 'owners') {
      if (db.owners[name] !== undefined) return 'owner exists';
      if (!NAME.test(name) || typeof val !== 'string' || val.length < 20 || val.length > 64) return 'bad owner';
      owners[name] = val;
    } else if (top === 'stamp') stamp[name] = val;
    else if (top !== 'board' && top !== 'grants') return 'unknown top';
  }
  for (const [path, val] of Object.entries(res)) {
    const [top, name, id] = path.split('/');
    if (top === 'grants') {
      if (val === null) {
        const s = stamp[name];
        if (!s || s.t !== now || s.k !== db.owners[name]) return 'grant clear denied';
        continue;
      }
      const s = stamp[ADMIN];
      if (!s || s.t !== now || s.k !== db.owners[ADMIN]) return 'grant denied (not admin)';
      if (!/^[a-z0-9]{6,24}$/.test(id)) return 'bad grant id';
      if (!GRANT_TYPES.includes(val.type) || val.t !== now) return 'bad grant';
      for (const k of Object.keys(val)) if (!['type', 'amount', 'level', 'mins', 'by', 't'].includes(k)) return `grant extra ${k}`;
      if ('amount' in val && !(typeof val.amount === 'number' && val.amount >= 0 && val.amount <= 1e12)) return 'bad amount';
      if ('level' in val && !(val.level >= -2 && val.level <= 3)) return 'bad level';
      if ('mins' in val && !(val.mins >= 0 && val.mins <= 10080)) return 'bad mins';
      continue;
    }
    if (top === 'stamp') {
      if (!val || val.k !== owners[name] || val.t !== now) return 'stamp denied';
    }
    if (top === 'board') {
      if (!val) return 'delete denied';
      const s = stamp[name];
      if (!s || s.t !== now || s.k !== owners[name]) return 'board denied';
      if (!BOARD_KEYS.every(k => k in val)) return 'missing fields';
      if (val.updated !== now) return 'updated must be now';
      if (typeof val.name !== 'string' || val.name.toLowerCase() !== name) return 'bad name';
      for (const k of Object.keys(val)) if (![...BOARD_KEYS, 'recent'].includes(k)) return `extra field ${k}`;
      for (const k of BOARD_KEYS.filter(k => k !== 'name')) if (typeof val[k] !== 'number') return `${k} not a number`;
      if (val.recent) {
        const items = Array.isArray(val.recent) ? val.recent : Object.values(val.recent);
        if (items.length > 10) return 'recent too long';
        for (const r of items) for (const k of ['g', 'b', 'm', 'p', 't']) if (!(k in r)) return `recent missing ${k}`;
      }
    }
  }
  return {res};
}

http
  .createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,PATCH,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.end();
    if (req.method === 'POST' && req.url === '/__reset') {
      db.owners = {};
      db.stamp = {};
      db.board = {};
      db.grants = {};
      return res.end('ok');
    }
    const url = new URL(req.url, 'http://x');
    const path = url.pathname.replace(/^\/|\.json$/g, '');
    if (req.method === 'GET') {
      const parts = path.split('/').filter(Boolean);
      if (parts[0] !== 'board' && parts[0] !== 'grants' && parts[0] !== '__all') {
        res.statusCode = 401;
        return res.end(JSON.stringify({error: 'Permission denied'}));
      }
      let v = parts[0] === '__all' ? db : db;
      for (const p of parts[0] === '__all' ? [] : parts) v = v?.[p];
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify(v ?? null));
    }
    if (req.method === 'PATCH' && path === '') {
      let body = '';
      req.on('data', c => (body += c));
      req.on('end', () => {
        const out = check(JSON.parse(body));
        if (typeof out === 'string') {
          res.statusCode = 401;
          return res.end(JSON.stringify({error: `Permission denied (${out})`}));
        }
        for (const [p, val] of Object.entries(out.res)) {
          const [top, name, id] = p.split('/');
          if (top === 'grants') {
            db.grants[name] ??= {};
            if (val === null) delete db.grants[name][id];
            else db.grants[name][id] = val;
            if (!Object.keys(db.grants[name]).length) delete db.grants[name];
          } else db[top][name] = val;
        }
        res.end(JSON.stringify(out.res));
      });
      return;
    }
    res.statusCode = 405;
    res.end();
  })
  .listen(port, '127.0.0.1', () => console.log(`mock db on http://127.0.0.1:${port}`));
