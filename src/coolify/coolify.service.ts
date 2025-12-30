import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { URL } from 'url';

@Injectable()
export class CoolifyService {
  private readonly logger = new Logger(CoolifyService.name);
  private readonly apiUrl: string;
  private readonly apiToken: string;
  private readonly serverUuid: string;
  private readonly defaultProjectUuid: string;
  private readonly environmentName: string;
  private readonly wildcardDomain: string;

  constructor(private readonly configService: ConfigService) {
    this.apiUrl = this.configService.get<string>('COOLIFY_API_URL') || '';
    this.apiToken = this.configService.get<string>('COOLIFY_API_TOKEN') || '';
    this.serverUuid = this.configService.get<string>('COOLIFY_SERVER_UUID') || '';
    this.defaultProjectUuid = this.configService.get<string>('COOLIFY_PROJECT_UUID') || '';
    this.environmentName = this.configService.get<string>('COOLIFY_ENVIRONMENT_NAME') || 'production';
    this.wildcardDomain = this.configService.get<string>('COOLIFY_WILDCARD_DOMAIN') || 'merfy.ru';

    if (!this.apiUrl || !this.apiToken) {
      this.logger.warn('Coolify API not fully configured');
    }
  }

  private async http<T = any>(path: string, init?: RequestInit): Promise<T> {
    if (!this.apiUrl || !this.apiToken) {
      throw new Error('Coolify API not configured');
    }

    const root = new URL(this.apiUrl);
    const prefixRaw = this.configService.get<string>('COOLIFY_API_PREFIX');
    let effectiveBase: URL;

    if (prefixRaw) {
      let prefix = prefixRaw.trim();
      if (prefix) {
        if (!prefix.startsWith('/')) prefix = `/${prefix}`;
        if (prefix === '/v1') prefix = '/api/v1';
        effectiveBase = new URL(prefix.replace(/^\//, ''), root);
      } else {
        effectiveBase = root;
      }
    } else if (!root.pathname.includes('/api/')) {
      effectiveBase = new URL('api/v1/', root);
    } else {
      effectiveBase = root;
    }

    const url = new URL(path.replace(/^\//, ''), effectiveBase).toString();
    const headers: Record<string, string> = {
      Accept: 'application/json',
      Authorization: `Bearer ${this.apiToken}`,
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init?.headers as any),
    };

    const res = await fetch(url, { ...init, headers });
    const hasPayload = res.status !== 204;
    const payload = hasPayload ? await res.json().catch(() => null) : null;

    if (!res.ok) {
      this.logger.warn(
        `Coolify API ${init?.method ?? 'GET'} ${path} failed: ${res.status} ${
          payload ? JSON.stringify(payload) : ''
        }`,
      );
      throw new Error(`coolify_api_${res.status}`);
    }
    return payload as T;
  }

  /**
   * getOrCreateProject — находит или создаёт Project в Coolify для tenant.
   */
  async getOrCreateProject(tenantId: string, companyName: string): Promise<{ uuid: string; name: string }> {
    try {
      const projects = await this.http<any[]>('/projects');

      // Ищем проект ТОЛЬКО по tenantId в description - это гарантирует уникальность
      // НЕ ищем по name, т.к. разные tenants могут иметь одинаковые названия компаний
      const found = Array.isArray(projects)
        ? projects.find((p: any) => p?.description?.includes(`tenant: ${tenantId}`))
        : null;

      if (found?.uuid) {
        this.logger.log(`Found existing project ${found.uuid} for tenant ${tenantId}`);
        return { uuid: found.uuid, name: found.name };
      }

      // Создаём новый проект с уникальным именем (companyName + короткий tenantId)
      const shortTenantId = tenantId.slice(0, 8);
      const projectName = companyName ? `${companyName} (${shortTenantId})` : `tenant-${shortTenantId}`;

      const result = await this.http<any>('/projects', {
        method: 'POST',
        body: JSON.stringify({
          name: projectName,
          description: `Company: ${companyName || 'N/A'} (tenant: ${tenantId})`,
        }),
      });

      if (!result?.uuid) {
        throw new Error('Project UUID not returned');
      }

      this.logger.log(`Created project ${result.uuid} for tenant ${tenantId}`);
      return { uuid: result.uuid, name: result.name || companyName };
    } catch (e) {
      this.logger.error(`getOrCreateProject failed: ${e instanceof Error ? e.message : e}`);
      throw e;
    }
  }

  /**
   * createStaticSiteApp — создаёт Coolify приложение для статического сайта.
   */
  async createStaticSiteApp(params: {
    projectUuid: string;
    name: string;
    subdomain: string;
    sitePath: string;
  }): Promise<{ uuid: string; url: string }> {
    const { projectUuid, name, subdomain, sitePath } = params;
    const fqdn = `https://${subdomain}`;
    const minioUrl =
      this.configService.get<string>('S3_PUBLIC_ENDPOINT') ||
      this.configService.get<string>('MINIO_PUBLIC_ENDPOINT') ||
      this.configService.get<string>('S3_ENDPOINT') ||
      'https://minio.example.com';
    const bucket = this.configService.get<string>('S3_BUCKET') || 'merfy-sites';
    const nginxProxyRepo =
      this.configService.get<string>('NGINX_PROXY_REPO') ||
      'https://github.com/Merfy-Dropshipping-Platform/nginx-minio-proxy';

    if (!this.serverUuid) {
      throw new Error('COOLIFY_SERVER_UUID is required');
    }

    try {
      const appPayload = {
        project_uuid: projectUuid,
        server_uuid: this.serverUuid,
        environment_name: this.environmentName,
        name,
        git_repository: nginxProxyRepo,
        git_branch: 'main',
        build_pack: 'dockerfile',
        ports_exposes: '80',
        domains: fqdn,
        instant_deploy: false,
      };

      this.logger.log(`Creating static site app: ${name} -> ${fqdn}`);

      const result = await this.http<any>('/applications/public', {
        method: 'POST',
        body: JSON.stringify(appPayload),
      });

      const appUuid = result?.uuid;
      if (!appUuid) {
        throw new Error('Application UUID not returned');
      }

      // Add environment variables
      const envVars = {
        data: [
          { key: 'MINIO_URL', value: minioUrl },
          { key: 'BUCKET', value: bucket },
          { key: 'SITE_PATH', value: sitePath },
        ],
      };

      await this.http(`/applications/${appUuid}/envs/bulk`, {
        method: 'PATCH',
        body: JSON.stringify(envVars),
      });

      // Set domain
      await this.http(`/applications/${appUuid}`, {
        method: 'PATCH',
        body: JSON.stringify({ domains: fqdn }),
      });

      // Start deployment
      await this.http(`/applications/${appUuid}/start`, { method: 'POST' });

      this.logger.log(`Created static site app ${appUuid}: ${fqdn}`);
      return { uuid: appUuid, url: fqdn };
    } catch (e) {
      this.logger.error(`createStaticSiteApp failed: ${e instanceof Error ? e.message : e}`);
      throw e;
    }
  }

  /**
   * restartApplication — перезапускает приложение.
   */
  async restartApplication(appUuid: string): Promise<{ success: boolean }> {
    try {
      await this.http(`/applications/${appUuid}/restart`, { method: 'POST' });
      return { success: true };
    } catch (e) {
      this.logger.error(`restartApplication failed: ${e instanceof Error ? e.message : e}`);
      throw e;
    }
  }

  /**
   * setDomain — привязать домен к приложению.
   */
  async setDomain(appUuid: string, domain: string): Promise<{ success: boolean }> {
    try {
      const fqdn = domain.startsWith('http') ? domain : `https://${domain}`;
      await this.http(`/applications/${appUuid}`, {
        method: 'PATCH',
        body: JSON.stringify({ domains: fqdn }),
      });
      return { success: true };
    } catch (e) {
      this.logger.error(`setDomain failed: ${e instanceof Error ? e.message : e}`);
      throw e;
    }
  }

  /**
   * toggleMaintenance — включить/выключить режим обслуживания.
   */
  async toggleMaintenance(appUuid: string, enabled: boolean): Promise<{ success: boolean }> {
    try {
      const path = enabled
        ? `/applications/${appUuid}/stop`
        : `/applications/${appUuid}/start`;
      await this.http(path, { method: 'POST' });
      return { success: true };
    } catch (e) {
      this.logger.error(`toggleMaintenance failed: ${e instanceof Error ? e.message : e}`);
      throw e;
    }
  }

  /**
   * deleteApplication — удаляет приложение.
   */
  async deleteApplication(appUuid: string): Promise<{ success: boolean }> {
    try {
      await this.http(`/applications/${appUuid}`, { method: 'DELETE' });
      return { success: true };
    } catch (e) {
      this.logger.error(`deleteApplication failed: ${e instanceof Error ? e.message : e}`);
      throw e;
    }
  }

  /**
   * health — проверка доступности Coolify API.
   */
  async health(): Promise<{ status: 'up' | 'down'; latencyMs: number }> {
    const start = Date.now();
    try {
      await this.http('version');
      return { status: 'up', latencyMs: Date.now() - start };
    } catch {
      return { status: 'down', latencyMs: Date.now() - start };
    }
  }
}
