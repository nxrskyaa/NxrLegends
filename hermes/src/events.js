// Turns raw logs into normalized NFT movements: mints, secondary transfers, burns.

import { TOPIC, decodeUintArrays } from './abi.js';
import { ZERO, ZERO_TOPIC, topicToAddr } from './util.js';

/**
 * ERC-721 Transfer and ERC-20 Transfer share a topic0. They are told apart by
 * shape: ERC-721 indexes the tokenId, so it has 4 topics and empty data.
 */
export function isErc721Transfer(log) {
  return log.topics?.[0] === TOPIC.transfer && log.topics.length === 4 && (!log.data || log.data === '0x' || /^0x0*$/.test(log.data));
}

export function normalize(log) {
  const t = log.topics || [];
  const base = {
    address: (log.address || '').toLowerCase(),
    block: Number(BigInt(log.blockNumber)),
    txHash: log.transactionHash,
    logIndex: Number(BigInt(log.logIndex ?? '0x0')),
  };

  if (isErc721Transfer(log)) {
    const from = topicToAddr(t[1]);
    const to = topicToAddr(t[2]);
    return [{ ...base, standard: 'erc721', from, to, tokenId: BigInt(t[3]).toString(), qty: 1, kind: kindOf(from, to) }];
  }

  if (t[0] === TOPIC.transferSingle && t.length === 4) {
    const from = topicToAddr(t[2]);
    const to = topicToAddr(t[3]);
    const body = (log.data || '0x').slice(2);
    const id = body.length >= 64 ? BigInt('0x' + body.slice(0, 64)).toString() : '0';
    const qty = body.length >= 128 ? Number(BigInt('0x' + body.slice(64, 128))) : 1;
    return [{ ...base, standard: 'erc1155', from, to, tokenId: id, qty, kind: kindOf(from, to) }];
  }

  if (t[0] === TOPIC.transferBatch && t.length === 4) {
    const from = topicToAddr(t[2]);
    const to = topicToAddr(t[3]);
    const [ids, vals] = decodeUintArrays(log.data);
    return ids.map((id, i) => ({
      ...base,
      standard: 'erc1155',
      from,
      to,
      tokenId: id.toString(),
      qty: Number(vals[i] ?? 1n),
      kind: kindOf(from, to),
    }));
  }

  return [];
}

const DEAD = new Set([ZERO, '0x000000000000000000000000000000000000dead']);

function kindOf(from, to) {
  if (from === ZERO) return 'mint';
  if (DEAD.has(to)) return 'burn';
  return 'transfer';
}

/** Topic filters that pull every mint on the chain in a single query per standard. */
export const MINT_FILTERS = [
  { label: 'erc721', topics: [TOPIC.transfer, ZERO_TOPIC] },
  { label: 'erc1155-single', topics: [TOPIC.transferSingle, null, ZERO_TOPIC] },
  { label: 'erc1155-batch', topics: [TOPIC.transferBatch, null, ZERO_TOPIC] },
];

/** All movements for a known set of collections (mints + secondary + burns). */
export const ALL_TRANSFER_TOPICS = [[TOPIC.transfer, TOPIC.transferSingle, TOPIC.transferBatch]];
