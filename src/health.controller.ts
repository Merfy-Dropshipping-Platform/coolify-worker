import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Controller()
export class HealthController {
  constructor(private readonly configService: ConfigService) {}

  @Get('health')
  health() {
    return {
      status: 'ok',
      service: 'coolify-worker',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('health/ready')
  async readiness() {
    const coolifyUrl = this.configService.get<string>('COOLIFY_API_URL');
    const coolifyToken = this.configService.get<string>('COOLIFY_API_TOKEN');

    let coolifyStatus: 'up' | 'down' = 'down';
    let coolifyError: string | undefined;
    const start = Date.now();

    try {
      const res = await fetch(`${coolifyUrl}/api/v1/version`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${coolifyToken}`,
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(3000),
      });
      coolifyStatus = res.ok ? 'up' : 'down';
      if (!res.ok) {
        coolifyError = `http_${res.status}`;
      }
    } catch (error) {
      coolifyError = error instanceof Error ? error.message : 'unknown';
    }

    return {
      status: coolifyStatus === 'up' ? 'ok' : 'degraded',
      service: 'coolify-worker',
      timestamp: new Date().toISOString(),
      checks: [
        {
          name: 'coolify-api',
          status: coolifyStatus,
          latencyMs: Date.now() - start,
          error: coolifyError,
        },
      ],
    };
  }
}
