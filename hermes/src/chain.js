// Contract-level probing: what standard is this, what is it called, is it alive.

import { SEL, IFACE, callData, encBytes4, encUint, decodeString, decodeUint, decodeBool, decodeAddress } from './abi.js';

export class Chain {
  constructor(rpc) {
    this.rpc = rpc;
    this._blockTs = new Map();
    this._probe = new Map();
  }

  /** Block timestamps, cached — we ask for them constantly when building rate metrics. */
  async blockTime(n) {
    if (this._blockTs.has(n)) return this._blockTs.get(n);
    const b = await this.rpc.getBlock(n, false).catch(() => null);
    const ts = b?.timestamp ? Number(BigInt(b.timestamp)) : null;
    if (ts) this._blockTs.set(n, ts);
    return ts;
  }

  /**
   * One batched round-trip per contract: ERC-165 probes plus metadata reads.
   * Returns null when the address has no code (EOA / self-destructed).
   */
  async probe(address) {
    const key = address.toLowerCase();
    if (this._probe.has(key)) return this._probe.get(key);

    const code = await this.rpc.getCode(address).catch(() => '0x');
    if (!code || code === '0x') {
      this._probe.set(key, null);
      return null;
    }

    const c = (data) => ({ method: 'eth_call', params: [{ to: address, data }, 'latest'] });
    const res = await this.rpc.batch([
      c(callData(SEL.supportsInterface, encBytes4(IFACE.erc721))),
      c(callData(SEL.supportsInterface, encBytes4(IFACE.erc1155))),
      c(callData(SEL.supportsInterface, encBytes4(IFACE.erc721Metadata))),
      c(SEL.name),
      c(SEL.symbol),
      c(SEL.totalSupply),
      c(SEL.owner),
      c(SEL.maxSupply),
      c(SEL.mintPrice),
    ]);

    const val = (r) => (r && typeof r === 'string' ? r : null);
    const is721 = decodeBool(val(res[0])) === true;
    const is1155 = decodeBool(val(res[1])) === true;

    const info = {
      address: key,
      codeSize: (code.length - 2) / 2,
      standard: is721 ? 'erc721' : is1155 ? 'erc1155' : null,
      hasMetadata: decodeBool(val(res[2])) === true,
      name: decodeString(val(res[3])),
      symbol: decodeString(val(res[4])),
      totalSupply: decodeUint(val(res[5])),
      owner: decodeAddress(val(res[6])),
      maxSupply: decodeUint(val(res[7])),
      mintPrice: decodeUint(val(res[8])),
    };
    this._probe.set(key, info);
    return info;
  }

  /** Fetches tokenURI/uri for one token and reports whether metadata is actually revealed. */
  async tokenUri(address, standard, tokenId = 1n) {
    const sel = standard === 'erc1155' ? SEL.uri : SEL.tokenURI;
    const ret = await this.rpc.call(address, callData(sel, encUint(tokenId)));
    const uri = decodeString(ret);
    if (!uri) return { uri: null, revealed: false };
    // A single shared URI across all ids is the classic "not revealed yet" pattern.
    const placeholder = /(unrevealed|placeholder|prereveal|hidden|coming.?soon|mystery)/i.test(uri);
    return { uri, revealed: !placeholder };
  }

  /** Live balances for a set of holders — used to verify our ledger against chain truth. */
  async balances(address, holders) {
    const calls = holders.map((h) => ({
      method: 'eth_call',
      params: [{ to: address, data: SEL.balanceOf + h.replace(/^0x/, '').padStart(64, '0') }, 'latest'],
    }));
    const res = await this.rpc.batch(calls);
    const out = new Map();
    res.forEach((r, i) => {
      const v = decodeUint(typeof r === 'string' ? r : null);
      if (v != null) out.set(holders[i], Number(v));
    });
    return out;
  }

  /**
   * Batched EOA-vs-contract check. One JSON-RPC batch for many addresses —
   * doing this one call at a time is what makes naive scanners crawl.
   */
  async areContracts(addresses) {
    const res = await this.rpc.batch(addresses.map((a) => ({ method: 'eth_getCode', params: [a, 'latest'] })));
    const out = new Map();
    res.forEach((r, i) => {
      if (typeof r === 'string') out.set(addresses[i], r !== '0x' && r !== '0x0');
    });
    return out;
  }

  /** Wallet fingerprint: is it a contract, how many txs has it sent. */
  async walletInfo(address) {
    const [code, nonce] = await Promise.all([
      this.rpc.getCode(address).catch(() => '0x'),
      this.rpc.getTxCount(address).catch(() => null),
    ]);
    return { address: address.toLowerCase(), isContract: !!code && code !== '0x', nonce };
  }
}
