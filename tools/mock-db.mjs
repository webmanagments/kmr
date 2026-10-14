// Dev-only: a tiny stand-in for the Firebase Realtime Database REST API that enforces
// the same rules as firebase-rules.json (claim-once names, owner-only updates).
// Usage: node tools/mock-db.mjs [port]   then set localStorage 'kmr.dbOverride' to http://127.0.0.1:<port>
import http from 'node:http';

const port = Number(process.argv[2] ?? 9199);
const db = {owners: {}, stamp: {}, board: {}, grants: {}, events: {}, arcade: {}};
// NO_ARCADE=1 acts like a database whose rules haven't been updated for the arcade boards yet.
const NO_ARCADE = process.env.NO_ARCADE === '1';
const ADMIN = 'kmr';
const GRANT_TYPES = ['add', 'remove', 'set', 'luck', 'reset', 'bonus', 'prize'];
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
    if (top === 'events') {
      if (rest.length) return 'bad event path';
      continue;
    }
    if (top === 'arcade') {
      if (NO_ARCADE) return 'arcade not allowed (rules not set up)';
      if (rest.length !== 1) return 'bad arcade path';
      continue;
    }
    if (rest.length) return 'deep paths not used by the app';
    if (top === 'owners') {
      if (db.owners[name] !== undefined) return 'owner exists';
      if (!NAME.test(name) || typeof val !== 'string' || val.length < 20 || val.length > 64) return 'bad owner';
      owners[name] = val;
    } else if (top === 'stamp') stamp[name] = val;
    else if (top !== 'board' && top !== 'grants' && top !== 'events') return 'unknown top';
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
      for (const k of Object.keys(val)) if (!['type', 'amount', 'level', 'mins', 'by', 't', 'place'].includes(k)) return `grant extra ${k}`;
      if ('amount' in val && !(typeof val.amount === 'number' && val.amount >= 0 && val.amount <= 1e12)) return 'bad amount';
      if ('level' in val && !(val.level >= -2 && val.level <= 3)) return 'bad level';
      if ('mins' in val && !(val.mins >= 0 && val.mins <= 10080)) return 'bad mins';
      continue;
    }
    if (top === 'events') {
      const s = stamp[ADMIN];
      if (!s || s.t !== now || s.k !== db.owners[ADMIN]) return 'event denied (not admin)';
      if (!['happy', 'announce', 'tourney'].includes(name)) return 'bad event';
      if (val === null) continue;
      const allowed = ['level', 'mins', 'start', 'msg', 't', 'by', 'id', 'days', 'prizes', 'status', 'repeat', 'last'];
      for (const k of Object.keys(val)) if (!allowed.includes(k)) return `event extra ${k}`;
      if ('start' in val && val.start !== now && val.start !== db.events[name]?.start) return 'start must be now';
      if ('t' in val && val.t !== now) return 't must be now';
      if ('msg' in val && (typeof val.msg !== 'string' || !val.msg.length || val.msg.length > 120)) return 'bad msg';
      if ('status' in val && !['live', 'paid'].includes(val.status)) return 'bad status';
      continue;
    }
    if (top === 'stamp') {
      if (!val || val.k !== owners[name] || val.t !== now) return 'stamp denied';
    }
    if (top === 'arcade') {
      const who = id;
      const s = stamp[who];
      if (!val) return 'arcade delete denied';
      if (!s || s.t !== now || s.k !== owners[who]) return 'arcade denied';
      if (!/^[a-z0-9_]{2,24}$/.test(name)) return 'bad game id';
      if (!['name', 'best', 'updated'].every(k => k in val) || val.updated !== now) return 'arcade missing fields';
      if (typeof val.name !== 'string' || val.name.toLowerCase() !== who) return 'arcade bad name';
      if (typeof val.best !== 'number' || val.best < 0 || val.best > 1e8) return 'arcade bad best';
      if ('games' in val && !(typeof val.games === 'number' && val.games >= 0)) return 'arcade bad games';
      if ('skin' in val && !(typeof val.skin === 'string' && val.skin.length <= 16)) return 'arcade bad skin';
      for (const [k, v] of Object.entries(val)) if (!['name', 'best', 'games', 'skin', 'updated'].includes(k) && !(typeof v === 'number' || (typeof v === 'string' && v.length <= 24))) return `arcade bad ${k}`;
    }
    if (top === 'board') {
      if (!val) return 'delete denied';
      const s = stamp[name];
      if (!s || s.t !== now || s.k !== owners[name]) return 'board denied';
      if (!BOARD_KEYS.every(k => k in val)) return 'missing fields';
      if (val.updated !== now) return 'updated must be now';
      if (typeof val.name !== 'string' || val.name.toLowerCase() !== name) return 'bad name';
      for (const k of Object.keys(val)) if (![...BOARD_KEYS, 'recent', 'tid', 'tp'].includes(k)) return `extra field ${k}`;
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
      db.events = {};
      db.arcade = {};
      return res.end('ok');
    }
    const url = new URL(req.url, 'http://x');
    const path = url.pathname.replace(/^\/|\.json$/g, '');
    if (req.method === 'GET') {
      const parts = path.split('/').filter(Boolean);
      if (NO_ARCADE && parts[0] === 'arcade') {
        res.statusCode = 401;
        return res.end(JSON.stringify({error: 'Permission denied'}));
      }
      if (parts[0] !== 'board' && parts[0] !== 'grants' && parts[0] !== 'events' && parts[0] !== 'arcade' && parts[0] !== '__all') {
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
          } else if (top === 'arcade') {
            db.arcade[name] ??= {};
            db.arcade[name][id] = val;
          } else if (val === null) delete db[top][name];
          else db[top][name] = val;
        }
        res.end(JSON.stringify(out.res));
      });
      return;
    }
    res.statusCode = 405;
    res.end();
  })
  .listen(port, '127.0.0.1', () => console.log(`mock db on http://127.0.0.1:${port}`));
