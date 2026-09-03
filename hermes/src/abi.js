// Hand-rolled ABI bits. Only what Hermes needs, so there is no ethers/web3 dependency.

// --- event topic0 (keccak256 of the signature) ---
export const TOPIC = {
  // Transfer(address indexed,address indexed,uint256 indexed)  -> ERC-721 (4 topics, empty data)
  // Transfer(address indexed,address indexed,uint256)          -> ERC-20  (3 topics, 32b data)
  transfer: '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
  // TransferSingle(address indexed operator,address indexed from,address indexed to,uint256 id,uint256 value)
  transferSingle: '0xc3d58168c5ae7397731d063d5bbf3d657854427343f4c083240f7aacaa2d0f62',
  // TransferBatch(address indexed operator,address indexed from,address indexed to,uint256[] ids,uint256[] values)
  transferBatch: '0x4a39dc06d4c0dbc64b70af90fd698a233a518aa5d07e595d983b8c0526c8f7fb',
};

// --- function selectors (first 4 bytes of keccak256 of the signature) ---
export const SEL = {
  supportsInterface: '0x01ffc9a7', // supportsInterface(bytes4)
  name: '0x06fdde03',
  symbol: '0x95d89b41',
  totalSupply: '0x18160ddd',
  owner: '0x8da5cb5b',
  balanceOf: '0x70a08231', // balanceOf(address)
  tokenURI: '0xc87b56dd', // tokenURI(uint256)
  uri: '0x0e89341c', // uri(uint256)
  maxSupply: '0xd5abeb01', // maxSupply()
  mintPrice: '0x6817c76c', // mintPrice()
};

// --- ERC-165 interface ids ---
export const IFACE = {
  erc721: '0x80ac58cd',
  erc721Metadata: '0x5b5e139f',
  erc1155: '0xd9b67a26',
};

const pad32 = (s) => s.replace(/^0x/, '').padStart(64, '0');

export const encBytes4 = (b4) => b4.replace(/^0x/, '').padEnd(64, '0');
export const encAddress = (a) => pad32(a.toLowerCase());
export const encUint = (n) => pad32(BigInt(n).toString(16));

export const callData = (selector, ...words) => selector + words.join('');

// --- return decoders ---
export function decodeUint(ret) {
  if (!ret || ret === '0x' || ret.length < 66) return null;
  try {
    return BigInt('0x' + ret.slice(2, 66));
  } catch {
    return null;
  }
}

export function decodeBool(ret) {
  const u = decodeUint(ret);
  return u == null ? null : u !== 0n;
}

export function decodeAddress(ret) {
  if (!ret || ret.length < 66) return null;
  return '0x' + ret.slice(26, 66).toLowerCase();
}

/**
 * Decodes an ABI-encoded `string` return value.
 * Falls back to reading the payload as a bytes32 for the handful of old
 * contracts that return a raw bytes32 name/symbol instead of a string.
 */
export function decodeString(ret) {
  if (!ret || ret === '0x') return null;
  const body = ret.slice(2);
  try {
    if (body.length >= 128) {
      const off = Number(BigInt('0x' + body.slice(0, 64)));
      const lenAt = off * 2;
      const len = Number(BigInt('0x' + body.slice(lenAt, lenAt + 64)));
      if (len > 0 && len < 4096) {
        const raw = body.slice(lenAt + 64, lenAt + 64 + len * 2);
        return Buffer.from(raw, 'hex').toString('utf8').replace(/\0+$/, '') || null;
      }
    }
  } catch {
    /* fall through to bytes32 */
  }
  if (body.length === 64) {
    const s = Buffer.from(body, 'hex').toString('utf8').replace(/\0+/g, '').trim();
    return s || null;
  }
  return null;
}

/** Decodes `uint256[] ids, uint256[] values` (the non-indexed body of TransferBatch). */
export function decodeUintArrays(data) {
  const body = (data || '0x').slice(2);
  const word = (i) => BigInt('0x' + body.slice(i * 64, i * 64 + 64));
  const readArr = (offBytes) => {
    const at = Number(offBytes) / 32;
    const len = Number(word(at));
    const out = [];
    for (let i = 0; i < len && i < 4096; i++) out.push(word(at + 1 + i));
    return out;
  };
  try {
    return [readArr(word(0)), readArr(word(1))];
  } catch {
    return [[], []];
  }
}
