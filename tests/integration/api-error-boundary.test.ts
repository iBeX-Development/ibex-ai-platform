import { EventEmitter } from 'node:events';
import type { IncomingMessage, RequestListener, ServerResponse } from 'node:http';
import type * as Http from 'node:http';
import { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createGatewayHttpHandler } from '../../apps/api/src/gateway.js';
import { startApi } from '../../apps/api/src/index.js';
import { PlatformError } from '../../packages/errors/src/index.js';
import type { AiGatewayService } from '../../packages/gateway/src/index.js';
import { validTestEnvironment } from '../../packages/testing/src/index.js';

// Capture the original API's listener without binding a socket or starting a service.
vi.mock('node:http', async (importOriginal) => {
  const original = await importOriginal<typeof Http>();
  return {
    ...original,
    createServer: vi.fn((listener: RequestListener) => {
      const server = original.createServer(listener);
      vi.spyOn(server, 'listen').mockReturnValue(server);
      return server;
    })
  };
});

const privateDetail = 'synthetic-private-payload-and-stack';
class ResponseProbe extends EventEmitter {
  headersSent = false;
  writableEnded = false;
  destroyed = false;
  statusCode = 0;
  bodies: string[] = [];
  writeHead = vi.fn((status: number) => {
    this.statusCode = status;
    this.headersSent = true;
    return this;
  });
  end = vi.fn((body?: string) => {
    if (body !== undefined) this.bodies.push(body);
    this.writableEnded = true;
    return this;
  });
  destroy = vi.fn(() => {
    this.destroyed = true;
    return this;
  });
  get response() {
    return this as unknown as ServerResponse;
  }
}

function request(url = '/chat', method = 'POST', body = '{}') {
  return Object.assign(Readable.from([Buffer.from(body)]), {
    url,
    method,
    headers: { 'x-request-id': privateDetail }
  }) as unknown as IncomingMessage;
}
function gateway(
  execute = vi.fn().mockResolvedValue({ status: 'success', response: { ok: true } })
) {
  return {
    execute,
    handler: createGatewayHttpHandler({ execute } as unknown as AiGatewayService, 64)
  };
}
function expectSafeFailure(probe: ResponseProbe, status = 500, code = 'INTERNAL_ERROR') {
  expect(probe.statusCode).toBe(status);
  expect(probe.writeHead).toHaveBeenCalledTimes(1);
  expect(probe.end).toHaveBeenCalledTimes(1);
  expect(JSON.parse(probe.bodies[0] ?? '')).toMatchObject({ error: { code } });
  expect(probe.bodies.join('')).not.toContain(privateDetail);
  expect(probe.bodies.join('')).not.toContain('stack');
}

describe('API HTTP error boundaries through original modules', () => {
  const unhandled = vi.fn();
  beforeEach(() => process.on('unhandledRejection', unhandled));
  afterEach(() => {
    process.removeListener('unhandledRejection', unhandled);
    try {
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      vi.clearAllMocks();
    }
  });

  it.each(['http://[invalid', 'http://host:invalid/chat'])(
    'rejects malformed target %s before Gateway work',
    async (target) => {
      const fixture = gateway();
      const probe = new ResponseProbe();
      await expect(fixture.handler(request(target), probe.response)).resolves.toBe(true);
      expectSafeFailure(probe, 400, 'VALIDATION_ERROR');
      expect(fixture.execute).not.toHaveBeenCalled();
    }
  );

  it('sanitizes a rejected service promise', async () => {
    const fixture = gateway(vi.fn().mockRejectedValue(new Error(privateDetail)));
    const probe = new ResponseProbe();
    await fixture.handler(request(), probe.response);
    expectSafeFailure(probe);
  });

  it('contains a body-stream failure before Gateway work', async () => {
    const fixture = gateway();
    const probe = new ResponseProbe();
    const broken = Object.assign(
      Readable.from(
        (function* () {
          yield Buffer.from('{');
          throw new Error(privateDetail);
        })()
      ),
      { url: '/chat', method: 'POST', headers: {} }
    ) as IncomingMessage;
    await fixture.handler(broken, probe.response);
    expectSafeFailure(probe);
    expect(fixture.execute).not.toHaveBeenCalled();
  });

  it('preserves trusted PlatformError correlation without trusting incoming headers', async () => {
    const fixture = gateway(
      vi
        .fn()
        .mockRejectedValue(
          new PlatformError(
            'PERMISSION_DENIED',
            'Access denied',
            403,
            { secret: privateDetail },
            'trusted-trace',
            'trusted-request'
          )
        )
    );
    const probe = new ResponseProbe();
    await fixture.handler(request(), probe.response);
    expectSafeFailure(probe, 403, 'PERMISSION_DENIED');
    expect(JSON.parse(probe.bodies[0] ?? '')).toEqual({
      error: {
        code: 'PERMISSION_DENIED',
        message: 'Access denied',
        trace_id: 'trusted-trace',
        request_id: 'trusted-request'
      }
    });
  });

  it.each(['circular', 'throwing serializer', 'undefined serialization'])(
    'serializes %s before committing success headers',
    async (mode) => {
      const result: Record<string, unknown> = { status: 'success' };
      if (mode === 'circular') result['self'] = result;
      else if (mode === 'throwing serializer')
        result['toJSON'] = () => {
          throw new Error(privateDetail);
        };
      else result['toJSON'] = () => undefined;
      const fixture = gateway(vi.fn().mockResolvedValue(result));
      const probe = new ResponseProbe();
      await fixture.handler(request(), probe.response);
      expectSafeFailure(probe);
    }
  );

  it.each(['headers', 'body'])(
    'closes a partial response after a %s write failure without a second response',
    async (stage) => {
      const fixture = gateway();
      const probe = new ResponseProbe();
      if (stage === 'headers')
        probe.writeHead.mockImplementation(() => {
          probe.headersSent = true;
          throw new Error(privateDetail);
        });
      else
        probe.end.mockImplementation(() => {
          throw new Error(privateDetail);
        });
      await expect(fixture.handler(request(), probe.response)).resolves.toBe(true);
      expect(probe.writeHead).toHaveBeenCalledTimes(1);
      expect(probe.end).toHaveBeenCalledTimes(stage === 'headers' ? 0 : 1);
      expect(probe.destroy).toHaveBeenCalledTimes(1);
    }
  );

  it.each(['ended', 'destroyed'])('does not write to an already %s response', async (state) => {
    const fixture = gateway(vi.fn().mockRejectedValue(new Error(privateDetail)));
    const probe = new ResponseProbe();
    probe.writableEnded = state === 'ended';
    probe.destroyed = state === 'destroyed';
    await expect(fixture.handler(request(), probe.response)).resolves.toBe(true);
    expect(probe.writeHead).not.toHaveBeenCalled();
    expect(probe.end).not.toHaveBeenCalled();
  });

  it('does not admit headers if serialization closes the response', async () => {
    const probe = new ResponseProbe();
    const fixture = gateway(
      vi.fn().mockResolvedValue({
        toJSON: () => {
          probe.writableEnded = true;
          return { status: 'success' };
        }
      })
    );
    await fixture.handler(request(), probe.response);
    expect(probe.writeHead).not.toHaveBeenCalled();
    expect(probe.end).not.toHaveBeenCalled();
  });

  it('preserves a Gateway rejection result and its status', async () => {
    const result = { status: 'rejected', request_id: 'trusted-request', trace_id: 'trusted-trace' };
    const fixture = gateway(vi.fn().mockResolvedValue(result));
    const probe = new ResponseProbe();
    await fixture.handler(request(), probe.response);
    expect(probe.statusCode).toBe(403);
    expect(JSON.parse(probe.bodies[0] ?? '')).toEqual(result);
  });

  it.each([
    ['/unknown', 'POST', '{}', false, 0],
    ['/chat', 'GET', '{}', true, 405],
    ['/chat', 'POST', '{', true, 400],
    ['/chat', 'POST', ' '.repeat(65), true, 413],
    ['/chat?mode=synthetic', 'POST', '{}', true, 200]
  ] as const)(
    'preserves route/body behavior for %s %s (%s)',
    async (url, method, body, handled, status) => {
      const fixture = gateway();
      const probe = new ResponseProbe();
      expect(await fixture.handler(request(url, method, body), probe.response)).toBe(handled);
      expect(probe.statusCode).toBe(status);
      expect(fixture.execute).toHaveBeenCalledTimes(status === 200 ? 1 : 0);
    }
  );

  async function dispatch(
    handler: ReturnType<typeof createGatewayHttpHandler> | undefined,
    probe: ResponseProbe,
    url = '/chat'
  ) {
    const server = startApi(validTestEnvironment, handler);
    const listener = server.listeners('request')[0] as RequestListener;
    try {
      listener(request(url, url === '/health' ? 'GET' : 'POST'), probe.response);
      // Flush the request, catch callback and late promise/error event work.
      for (let i = 0; i < 3; i++) await new Promise<void>((resolve) => setImmediate(resolve));
    } finally {
      server.removeAllListeners();
    }
  }

  it.each(['sync', 'async'])('contains unexpected %s dispatcher failure', async (mode) => {
    const handler = vi.fn(() => {
      if (mode === 'sync') throw new Error(privateDetail);
      return Promise.reject(new Error(privateDetail));
    });
    const probe = new ResponseProbe();
    await dispatch(handler, probe);
    expectSafeFailure(probe);
  });

  it('retains trusted correlation but sanitizes an unexpected dispatcher error', async () => {
    const handler = vi
      .fn()
      .mockRejectedValue(
        new PlatformError(
          'DEPENDENCY_ERROR',
          privateDetail,
          503,
          undefined,
          'trusted-trace',
          'trusted-request'
        )
      );
    const probe = new ResponseProbe();
    await dispatch(handler, probe);
    expectSafeFailure(probe);
    expect(JSON.parse(probe.bodies[0] ?? '')).toMatchObject({
      error: { trace_id: 'trusted-trace', request_id: 'trusted-request' }
    });
  });

  it.each(['partial', 'ended', 'destroyed'])(
    'contains handler rejection after a %s response',
    async (state) => {
      const probe = new ResponseProbe();
      const handler = vi.fn(() => {
        probe.headersSent = true;
        probe.writableEnded = state === 'ended';
        probe.destroyed = state === 'destroyed';
        return Promise.reject(new Error(privateDetail));
      });
      await dispatch(handler, probe);
      expect(probe.writeHead).not.toHaveBeenCalled();
      expect(probe.end).not.toHaveBeenCalled();
      expect(probe.destroy).toHaveBeenCalledTimes(state === 'partial' ? 1 : 0);
    }
  );

  it.each(['header failure', 'body failure', 'cleanup failure'])(
    'terminal rejection handling cannot reject again on %s',
    async (mode) => {
      const probe = new ResponseProbe();
      if (mode !== 'body failure')
        probe.writeHead.mockImplementation(() => {
          throw new Error(privateDetail);
        });
      else
        probe.end.mockImplementation(() => {
          throw new Error(privateDetail);
        });
      if (mode === 'cleanup failure')
        probe.destroy.mockImplementation(() => {
          throw new Error(privateDetail);
        });
      await dispatch(vi.fn().mockRejectedValue(new Error(privateDetail)), probe);
      expect(probe.writeHead).toHaveBeenCalledTimes(1);
      expect(probe.destroy).toHaveBeenCalledTimes(1);
    }
  );

  it('contains failure while reading error correlation itself', async () => {
    const error = new PlatformError('DEPENDENCY_ERROR', privateDetail, 500);
    Object.defineProperty(error, 'traceId', {
      get: () => {
        throw new Error(privateDetail);
      }
    });
    const probe = new ResponseProbe();
    await dispatch(vi.fn().mockRejectedValue(error), probe);
    expect(probe.writeHead).not.toHaveBeenCalled();
    expect(probe.end).not.toHaveBeenCalled();
    expect(probe.destroy).toHaveBeenCalledTimes(1);
  });

  it('handles asynchronous response errors without writing a replacement body', async () => {
    const probe = new ResponseProbe();
    const handler = vi.fn(() => {
      probe.headersSent = true;
      setImmediate(() => probe.emit('error', new Error(privateDetail)));
      return Promise.resolve(true);
    });
    await dispatch(handler, probe);
    expect(probe.destroy).toHaveBeenCalledTimes(1);
    expect(probe.writeHead).not.toHaveBeenCalled();
    expect(probe.end).not.toHaveBeenCalled();
  });

  it('preserves health and default no-Gateway 404 wiring', async () => {
    const handler = vi.fn().mockResolvedValue(false);
    const health = new ResponseProbe();
    await dispatch(handler, health, '/health');
    expect(health.statusCode).toBe(200);
    expect(JSON.parse(health.bodies[0] ?? '')).toEqual({
      status: 'disabled',
      service: 'test-service',
      ai_platform_enabled: false
    });
    expect(handler).not.toHaveBeenCalled();
    const missing = new ResponseProbe();
    await dispatch(undefined, missing);
    expect(missing.statusCode).toBe(404);
    expect(JSON.parse(missing.bodies[0] ?? '')).toEqual({
      error: { code: 'NOT_FOUND', message: 'Route not found' }
    });
  });

  it.each([
    'malformed target',
    'dispatcher rejection',
    'serialization failure',
    'partial response'
  ])('verifies %s on real Node HTTP transport and closes all test resources', async (mode) => {
    const http = await vi.importActual<typeof Http>('node:http');
    const fixture = gateway();
    let handler = fixture.handler;
    if (mode === 'dispatcher rejection')
      handler = vi.fn().mockRejectedValue(new Error(privateDetail));
    if (mode === 'serialization failure')
      fixture.execute.mockResolvedValue({
        toJSON: () => {
          throw new Error(privateDetail);
        }
      });
    if (mode === 'partial response')
      handler = (_request, response) => {
        response.writeHead(200);
        response.write('{"partial":');
        return Promise.reject(new Error(privateDetail));
      };
    const api = startApi(validTestEnvironment, handler);
    const server = http.createServer(api.listeners('request')[0] as RequestListener);
    api.removeAllListeners();
    let client: Http.ClientRequest | undefined;
    try {
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
      });
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Missing test listener');
      const outcome = new Promise<{ status: number | undefined; body: string }>(
        (resolve, reject) => {
          client = http.request(
            {
              host: '127.0.0.1',
              port: address.port,
              path: mode === 'malformed target' ? 'http://host:invalid/chat' : '/chat',
              method: 'POST',
              agent: false
            },
            (response) => {
              const chunks: Buffer[] = [];
              response.on('data', (chunk: Buffer) => chunks.push(chunk));
              response.once('error', reject);
              response.once('aborted', () => {
                reject(new Error('Test response closed'));
              });
              response.once('end', () => {
                resolve({
                  status: response.statusCode,
                  body: Buffer.concat(chunks).toString('utf8')
                });
              });
            }
          );
          client.once('error', reject);
          client.setTimeout(1_000, () => client?.destroy(new Error('Test transport deadline')));
          client.end('{}');
        }
      );
      if (mode === 'partial response')
        await expect(outcome).rejects.toThrow(/socket hang up|Test response closed|aborted/);
      else {
        const result = await outcome;
        expect(result.status).toBe(mode === 'malformed target' ? 400 : 500);
        expect(JSON.parse(result.body)).toEqual({
          error: {
            code: mode === 'malformed target' ? 'VALIDATION_ERROR' : 'INTERNAL_ERROR',
            message:
              mode === 'malformed target'
                ? 'Request target is invalid'
                : 'An internal error occurred'
          }
        });
        expect(result.body).not.toContain(privateDetail);
      }
      if (mode === 'malformed target') expect(fixture.execute).not.toHaveBeenCalled();
    } finally {
      client?.destroy();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
        server.closeAllConnections();
      });
      server.removeAllListeners();
    }
    expect(server.listening).toBe(false);
  });
});
