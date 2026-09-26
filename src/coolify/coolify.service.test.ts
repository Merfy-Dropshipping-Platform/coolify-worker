import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ConfigService } from '@nestjs/config';
import { CoolifyService } from './coolify.service';

// Запуск: pnpm test (tsx --test). В репозитории раньше не было тестов; jest в скрипте был без зависимости.
function makeService(env: Record<string, string>, http: (path: string, init?: RequestInit) => Promise<any>) {
  const config = { get: (k: string) => env[k] } as unknown as ConfigService;
  const service = new CoolifyService(config);
  (service as any).http = http;
  return service;
}

const TENANT = '1234abcd-0000-0000-0000-000000000000';

describe('CoolifyService.getOrCreateProject: контур tenant-проектов (spec 116)', () => {
  it('прод (без префикса): находит существующий проект tenant и не создаёт новый', async () => {
    const calls: string[] = [];
    const service = makeService({}, async (path, init) => {
      calls.push(`${init?.method ?? 'GET'} ${path}`);
      return [{ uuid: 'prod1', name: 'tenant-1234abcd', description: `Company: X (tenant: ${TENANT})` }];
    });
    assert.deepEqual(await service.getOrCreateProject(TENANT, 'X'), { uuid: 'prod1', name: 'tenant-1234abcd' });
    assert.deepEqual(calls, ['GET /projects']);
  });

  it('dev (префикс dev-tenant-): прод-проект того же tenant не подходит, создаётся свой с меткой контура', async () => {
    const bodies: any[] = [];
    const service = makeService({ COOLIFY_TENANT_PROJECT_PREFIX: 'dev-tenant-' }, async (path, init) => {
      if (init?.method === 'POST') {
        bodies.push(JSON.parse(String(init.body)));
        return { uuid: 'dev1', name: bodies[0].name };
      }
      return [{ uuid: 'prod1', name: 'tenant-1234abcd', description: `Company: X (tenant: ${TENANT})` }];
    });
    const res = await service.getOrCreateProject(TENANT, '');
    assert.equal(res.uuid, 'dev1');
    assert.equal(bodies[0].name, 'dev-tenant-1234abcd');
    assert.match(bodies[0].description, /^\(dev-tenant\) Company N\/A \(tenant 1234abcd/); // sanitizeDescription вырезает двоеточия
  });

  it('прод не подхватывает dev-проект того же tenant', async () => {
    const bodies: any[] = [];
    const service = makeService({}, async (path, init) => {
      if (init?.method === 'POST') {
        bodies.push(JSON.parse(String(init.body)));
        return { uuid: 'prod-new', name: bodies[0].name };
      }
      return [{ uuid: 'dev1', name: 'dev-tenant-1234abcd', description: `(dev-tenant) Company X (tenant ${TENANT})` }];
    });
    const res = await service.getOrCreateProject(TENANT, 'X');
    assert.equal(res.uuid, 'prod-new');
    assert.equal(bodies[0].name, 'X - 1234abcd');
  });
});
