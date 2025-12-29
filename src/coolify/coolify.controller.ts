import { Controller, Logger } from '@nestjs/common';
import { MessagePattern, Payload, Ctx, RmqContext } from '@nestjs/microservices';
import { CoolifyService } from './coolify.service';

@Controller()
export class CoolifyController {
  private readonly logger = new Logger(CoolifyController.name);

  constructor(private readonly coolifyService: CoolifyService) {}

  @MessagePattern('coolify.health')
  async health() {
    try {
      const result = await this.coolifyService.health();
      return { success: true, ...result };
    } catch (e: any) {
      return { success: false, error: e?.message || 'unknown' };
    }
  }

  @MessagePattern('coolify.get_or_create_project')
  async getOrCreateProject(
    @Payload() data: { tenantId: string; companyName: string },
    @Ctx() _ctx: RmqContext,
  ) {
    this.logger.log(`getOrCreateProject: tenant=${data.tenantId}, company=${data.companyName}`);
    try {
      const { tenantId, companyName } = data;
      if (!tenantId) {
        return { success: false, message: 'tenantId is required' };
      }
      const result = await this.coolifyService.getOrCreateProject(tenantId, companyName || tenantId);
      return { success: true, projectUuid: result.uuid, projectName: result.name };
    } catch (e: any) {
      this.logger.error(`getOrCreateProject failed: ${e?.message}`);
      return { success: false, message: e?.message || 'internal_error' };
    }
  }

  @MessagePattern('coolify.create_static_site_app')
  async createStaticSiteApp(
    @Payload()
    data: {
      projectUuid: string;
      name: string;
      subdomain: string;
      sitePath: string;
    },
    @Ctx() _ctx: RmqContext,
  ) {
    this.logger.log(`createStaticSiteApp: name=${data.name}, subdomain=${data.subdomain}`);
    try {
      const { projectUuid, name, subdomain, sitePath } = data;
      if (!projectUuid || !name || !subdomain || !sitePath) {
        return { success: false, message: 'projectUuid, name, subdomain, sitePath are required' };
      }
      const result = await this.coolifyService.createStaticSiteApp({
        projectUuid,
        name,
        subdomain,
        sitePath,
      });
      return { success: true, appUuid: result.uuid, url: result.url };
    } catch (e: any) {
      this.logger.error(`createStaticSiteApp failed: ${e?.message}`);
      return { success: false, message: e?.message || 'internal_error' };
    }
  }

  @MessagePattern('coolify.restart_application')
  async restartApplication(
    @Payload() data: { appUuid: string },
    @Ctx() _ctx: RmqContext,
  ) {
    this.logger.log(`restartApplication: appUuid=${data.appUuid}`);
    try {
      const { appUuid } = data;
      if (!appUuid) {
        return { success: false, message: 'appUuid is required' };
      }
      await this.coolifyService.restartApplication(appUuid);
      return { success: true };
    } catch (e: any) {
      this.logger.error(`restartApplication failed: ${e?.message}`);
      return { success: false, message: e?.message || 'internal_error' };
    }
  }

  @MessagePattern('coolify.set_domain')
  async setDomain(
    @Payload() data: { appUuid: string; domain: string },
    @Ctx() _ctx: RmqContext,
  ) {
    this.logger.log(`setDomain: appUuid=${data.appUuid}, domain=${data.domain}`);
    try {
      const { appUuid, domain } = data;
      if (!appUuid || !domain) {
        return { success: false, message: 'appUuid and domain are required' };
      }
      await this.coolifyService.setDomain(appUuid, domain);
      return { success: true };
    } catch (e: any) {
      this.logger.error(`setDomain failed: ${e?.message}`);
      return { success: false, message: e?.message || 'internal_error' };
    }
  }

  @MessagePattern('coolify.toggle_maintenance')
  async toggleMaintenance(
    @Payload() data: { appUuid: string; enabled: boolean },
    @Ctx() _ctx: RmqContext,
  ) {
    this.logger.log(`toggleMaintenance: appUuid=${data.appUuid}, enabled=${data.enabled}`);
    try {
      const { appUuid, enabled } = data;
      if (!appUuid || typeof enabled !== 'boolean') {
        return { success: false, message: 'appUuid and enabled are required' };
      }
      await this.coolifyService.toggleMaintenance(appUuid, enabled);
      return { success: true };
    } catch (e: any) {
      this.logger.error(`toggleMaintenance failed: ${e?.message}`);
      return { success: false, message: e?.message || 'internal_error' };
    }
  }

  @MessagePattern('coolify.delete_application')
  async deleteApplication(
    @Payload() data: { appUuid: string },
    @Ctx() _ctx: RmqContext,
  ) {
    this.logger.log(`deleteApplication: appUuid=${data.appUuid}`);
    try {
      const { appUuid } = data;
      if (!appUuid) {
        return { success: false, message: 'appUuid is required' };
      }
      await this.coolifyService.deleteApplication(appUuid);
      return { success: true };
    } catch (e: any) {
      this.logger.error(`deleteApplication failed: ${e?.message}`);
      return { success: false, message: e?.message || 'internal_error' };
    }
  }
}
