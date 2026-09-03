// A synthetic Robinhood-Chain-shaped JSON-RPC endpoint.
// Lets the whole agent be exercised end to end without touching a real network:
// one organic launch, one whale self-mint, one bot farm, and an ERC-20 decoy.

import http from 'node:http';
import { TOPIC } from '../src/abi.js';

const ZT = '0x' + '0'.repeat(64);
const t = (a) => '0x' + '0'.repeat(24) + a.slice(2);
const addr = (seed, i) => '0x' + (BigInt(seed) * 1000003n + BigInt(i)).toString(16).padStart(40, '0').slice(-40);

export const FIXTURES = {
  organic: addr(11, 0),
  whale: addr(22, 0),
  botfarm: addr(33, 0),
  erc20: addr(44, 0),
  deployerOrganic: addr(11, 999),
  smart: [addr(77, 1), addr(77, 2), addr(77, 3)],
};

const BLOCK_TIME = 2;
const START = 1000;
const END = 1900;
// Anchor the fake chain so its head is 'now' — otherwise the agent correctly
// prunes the whole fixture as stale.
const GENESIS_TS = Math.floor(Date.now() / 1000) - (END - START) * BLOCK_TIME;

function buildLogs() {
  const logs = [];
  let seq = 0;
  const push = (block, address, topics, data = '0x') =>
    logs.push({
      address,
      topics,
      data,
      blockNumber: '0x' + block.toString(16),
      transactionHash: '0x' + (++seq).toString(16).padStart(64, '0'),
      logIndex: '0x0',
    });
  const mint721 = (block, col, to, id) => push(block, col, [TOPIC.transfer, ZT, t(to), '0x' + id.toString(16).padStart(64, '0')]);

  // --- organic launch: mint rate ramps, ~46 distinct wallets, mild bulk ---
  let id = 1;
  for (let b = START + 40; b <= START + 340; b += 4) {
    const phase = (b - START - 40) / 300; // 0 -> 1, accelerating
    const n = 1 + Math.floor(phase * 4);
    for (let k = 0; k < n; k++) {
      const w = Math.floor((id * 7919) % 46);
      // the first few mints come from wallets we will register as smart money
      const to = id <= 3 ? FIXTURES.smart[id - 1] : addr(101, w);
      mint721(b, FIXTURES.organic, to, id++);
    }
  }
  // a little secondary flow late on: proof a bid exists, not a dump
  for (let i = 0; i < 14; i++) {
    push(START + 300 + i * 3, FIXTURES.organic, [TOPIC.transfer, t(addr(101, i)), t(addr(202, i)), '0x' + (i + 5).toString(16).padStart(64, '0')]);
  }

  // --- whale: one wallet mints the entire supply to itself ---
  for (let i = 0; i < 400; i++) {
    mint721(START + 60 + Math.floor(i / 20), FIXTURES.whale, FIXTURES.whale, i + 1);
  }

  // --- bot farm: 180 contract wallets take exactly one each, in a burst ---
  for (let i = 0; i < 180; i++) {
    mint721(START + 100 + Math.floor(i / 60), FIXTURES.botfarm, addr(303, i), i + 1);
  }

  // --- ERC-20 decoy: same topic0, 3 topics + data. Must never be tracked. ---
  for (let i = 0; i < 30; i++) {
    push(START + 120 + i, FIXTURES.erc20, [TOPIC.transfer, ZT, t(addr(404, i))], '0x' + (10n ** 18n).toString(16).padStart(64, '0'));
  }

  return logs.sort((a, b) => Number(BigInt(a.blockNumber)) - Number(BigInt(b.blockNumber)));
}

const LOGS = buildLogs();

const encStr = (s) => {
  const hexs = Buffer.from(s, 'utf8').toString('hex');
  const padded = hexs.padEnd(Math.ceil(hexs.length / 64) * 64, '0');
  return '0x' + (32).toString(16).padStart(64, '0') + (s.length).toString(16).padStart(64, '0') + padded;
};
const encUint = (n) => '0x' + BigInt(n).toString(16).padStart(64, '0');
const encBool = (b) => encUint(b ? 1 : 0);
const encAddr = (a) => '0x' + '0'.repeat(24) + a.slice(2);

const META = {
  [FIXTURES.organic]: { name: 'Hermes Test Alpha', symbol: 'HTA', supply: 900, max: 1000, owner: FIXTURES.deployerOrganic },
  [FIXTURES.whale]: { name: 'Whale Dump', symbol: 'WD', supply: 400, max: 400, owner: FIXTURES.whale },
  [FIXTURES.botfarm]: { name: 'Bot Farm', symbol: 'BOT', supply: 180, max: 5000, owner: addr(33, 500) },
};

function handle(req) {
  const { method, params } = req;
  switch (method) {
    case 'eth_blockNumber':
      return encUint(END);
    case 'eth_chainId':
      return encUint(424242);
    case 'eth_getBlockByNumber': {
      const n = Number(BigInt(params[0]));
      return { number: params[0], timestamp: encUint(GENESIS_TS + (n - START) * BLOCK_TIME), hash: '0x' + n.toString(16).padStart(64, '0') };
    }
    case 'eth_getTransactionCount':
      return encUint(42);
    case 'eth_getCode': {
      const a = params[0].toLowerCase();
      if (META[a] || a === FIXTURES.erc20) return '0x60806040' + 'ab'.repeat(600);
      // bot-farm minters are contracts; everyone else is an EOA
      const isBot = LOGS.some((l) => l.address === FIXTURES.botfarm && l.topics[2] === t(a));
      return isBot ? '0x60806040' + 'cd'.repeat(200) : '0x';
    }
    case 'eth_getLogs': {
      const f = params[0];
      const from = Number(BigInt(f.fromBlock));
      const to = Number(BigInt(f.toBlock));
      const addrs = f.address ? new Set((Array.isArray(f.address) ? f.address : [f.address]).map((x) => x.toLowerCase())) : null;
      return LOGS.filter((l) => {
        const b = Number(BigInt(l.blockNumber));
        if (b < from || b > to) return false;
        if (addrs && !addrs.has(l.address)) return false;
        if (!f.topics) return true;
        return f.topics.every((want, i) => {
          if (want == null) return true;
          const got = l.topics[i];
          return Array.isArray(want) ? want.includes(got) : want === got;
        });
      });
    }
    case 'eth_call': {
      const to = params[0].to.toLowerCase();
      const data = params[0].data;
      const m = META[to];
      if (!m) return '0x';
      if (data.startsWith('0x01ffc9a7')) {
        const iface = data.slice(10, 18);
        return encBool(iface === '80ac58cd' || iface === '5b5e139f');
      }
      if (data.startsWith('0x06fdde03')) return encStr(m.name);
      if (data.startsWith('0x95d89b41')) return encStr(m.symbol);
      if (data.startsWith('0x18160ddd')) return encUint(m.supply);
      if (data.startsWith('0x8da5cb5b')) return encAddr(m.owner);
      if (data.startsWith('0xd5abeb01')) return encUint(m.max);
      if (data.startsWith('0x6817c76c')) return encUint(10n ** 16n);
      if (data.startsWith('0xc87b56dd')) return encStr(`ipfs://bafyhermes/${to.slice(2, 8)}/1.json`);
      return '0x';
    }
    default:
      throw new Error(`mock: unhandled ${method}`);
  }
}

export function startMock(port = 0) {
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      let payload;
      try {
        payload = JSON.parse(body);
      } catch {
        res.writeHead(400).end('bad json');
        return;
      }
      const one = (r) => {
        try {
          return { jsonrpc: '2.0', id: r.id, result: handle(r) };
        } catch (e) {
          return { jsonrpc: '2.0', id: r.id, error: { code: -32000, message: e.message } };
        }
      };
      const out = Array.isArray(payload) ? payload.map(one) : one(payload);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(out));
    });
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve({ server, url: `http://127.0.0.1:${server.address().port}` })));
}

export const RANGE = { START, END, GENESIS_TS, BLOCK_TIME };
