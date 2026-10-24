// Synthetic-only ingress prototype. No production adapter imports this file.
export interface IngressLimits {
  readonly bytes: number;
  readonly depth: number;
}

/** Snapshot without invoking getters, coercion, toJSON, or secondary decoding. */
export function structuredSnapshot(value: unknown, limits: IngressLimits): unknown {
  function copy(item: unknown, depth: number): unknown {
    if (depth > limits.depth) throw new Error('depth');
    if (item === null || typeof item === 'string' || typeof item === 'boolean') return item;
    if (typeof item === 'number' && Number.isFinite(item)) return item;
    if (typeof item !== 'object') throw new Error('non-json');
    const prototype: unknown = Object.getPrototypeOf(item);
    const descriptors = Object.getOwnPropertyDescriptors(item);
    if (Array.isArray(item)) {
      if (prototype !== Array.prototype || Reflect.ownKeys(item).length !== item.length + 1)
        throw new Error('array shape');
      return Object.freeze(Array.from({ length: item.length }, (_, index) => {
        const d = descriptors[String(index)];
        if (!d || !('value' in d) || !d.enumerable) throw new Error('array property');
        return copy(d.value, depth + 1);
      }));
    }
    if (prototype !== Object.prototype && prototype !== null) throw new Error('prototype');
    const result: Record<string, unknown> = {};
    for (const key of Reflect.ownKeys(item)) {
      if (typeof key !== 'string' || key === '__proto__') throw new Error('key');
      const d = descriptors[key];
      if (!d || !('value' in d) || !d.enumerable) throw new Error('accessor');
      result[key] = copy(d.value, depth + 1);
    }
    return Object.freeze(result);
  }
  const result = copy(value, 0);
  if (Buffer.byteLength(JSON.stringify(result), 'utf8') > limits.bytes) throw new Error('size');
  return result;
}

/** Reject duplicate decoded member names before materializing an object. */
export function rawJsonSnapshot(bytes: Uint8Array, limits: IngressLimits): unknown {
  if (bytes.byteLength > limits.bytes) throw new Error('size');
  const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  let offset = 0;
  const ws = () => { while (/[\x20\t\r\n]/.test(text[offset] ?? '') && offset < text.length) offset++; };
  function stringToken(): string {
    const start = offset++;
    while (offset < text.length) {
      const ch = text[offset++];
      if (ch === '\\') { offset++; continue; }
      if (ch === '"') {
        const value: unknown = JSON.parse(text.slice(start, offset));
        if (typeof value !== 'string') throw new Error('string');
        return value;
      }
    }
    throw new Error('unterminated string');
  }
  function value(depth: number): void {
    if (depth > limits.depth) throw new Error('depth');
    ws();
    const ch = text[offset];
    if (ch === '"') { stringToken(); return; }
    if (ch === '{') {
      offset++; ws();
      const keys = new Set<string>();
      if (text[offset] === '}') { offset++; return; }
      for (;;) {
        ws();
        if (text[offset] !== '"') throw new Error('member');
        const key = stringToken();
        if (keys.has(key)) throw new Error('duplicate member');
        keys.add(key); ws();
        if (text[offset++] !== ':') throw new Error('colon');
        value(depth + 1); ws();
        const separator = text[offset++];
        if (separator === '}') return;
        if (separator !== ',') throw new Error('object separator');
      }
    }
    if (ch === '[') {
      offset++; ws();
      if (text[offset] === ']') { offset++; return; }
      for (;;) {
        value(depth + 1); ws();
        const separator = text[offset++];
        if (separator === ']') return;
        if (separator !== ',') throw new Error('array separator');
      }
    }
    const start = offset;
    while (offset < text.length && !/[\x20\t\r\n,}\]]/.test(text[offset] ?? '')) offset++;
    const token = text.slice(start, offset);
    if (!/^(?:null|true|false|-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?)$/.test(token))
      throw new Error('token');
    const parsed: unknown = JSON.parse(token);
    if (typeof parsed === 'number' && !Number.isFinite(parsed)) throw new Error('nonfinite');
  }
  value(0); ws();
  if (offset !== text.length) throw new Error('trailing input');
  const decoded: unknown = JSON.parse(text);
  return structuredSnapshot(decoded, limits);
}
