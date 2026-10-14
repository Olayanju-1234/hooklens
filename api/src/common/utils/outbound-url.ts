import * as dns from 'dns';
import * as http from 'http';
import * as https from 'https';
import { BlockList, isIP } from 'net';
import type { LookupFunction } from 'net';

const blocked = new BlockList();
for (const [network, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  blocked.addSubnet(network, prefix, 'ipv4');
}
for (const [network, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
] as const) {
  blocked.addSubnet(network, prefix, 'ipv6');
}

export class UnsafeUrlError extends Error {}

export function isPrivateAddress(address: string): boolean {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
  if (mapped) return blocked.check(mapped[1], 'ipv4');
  return isIP(address) === 6
    ? blocked.check(address, 'ipv6')
    : blocked.check(address, 'ipv4');
}

/** Rejects non-http(s) URLs and hosts that are, or resolve to, private addresses. */
export async function assertPublicUrl(rawUrl: string): Promise<void> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new UnsafeUrlError('Invalid URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new UnsafeUrlError('Only http and https URLs are allowed');
  }

  const host = url.hostname.replace(/^\[|\]$/g, '');
  const addresses = isIP(host)
    ? [host]
    : (await dns.promises.lookup(host, { all: true })).map((a) => a.address);
  if (addresses.some(isPrivateAddress)) {
    throw new UnsafeUrlError(
      `${url.hostname} points to a private or internal address`,
    );
  }
}

// Re-checks the address at connect time so DNS rebinding can't slip past assertPublicUrl
const publicOnlyLookup: LookupFunction = (hostname, options, callback) => {
  dns.lookup(hostname, { ...options, all: true }, (err, results) => {
    if (err) return callback(err, '', 0);
    const list = results;
    const unsafe = list.find((r) => isPrivateAddress(r.address));
    if (unsafe) {
      return callback(
        new UnsafeUrlError(`${hostname} resolves to a private address`),
        '',
        0,
      );
    }
    if (options.all) {
      return (callback as unknown as (e: null, a: dns.LookupAddress[]) => void)(
        null,
        list,
      );
    }
    return callback(null, list[0].address, list[0].family);
  });
};

export const publicHttpAgent = new http.Agent({ lookup: publicOnlyLookup });
export const publicHttpsAgent = new https.Agent({ lookup: publicOnlyLookup });

/** Axios options for a user-supplied URL: no redirects, private targets blocked unless allowed. */
export async function outboundRequestOptions(
  url: string,
  allowPrivate: boolean,
): Promise<{
  maxRedirects: number;
  httpAgent?: http.Agent;
  httpsAgent?: https.Agent;
}> {
  if (allowPrivate) return { maxRedirects: 0 };
  await assertPublicUrl(url);
  return {
    maxRedirects: 0,
    httpAgent: publicHttpAgent,
    httpsAgent: publicHttpsAgent,
  };
}
