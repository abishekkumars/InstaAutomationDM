import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

interface ReadyResponse {
  status: 'ready';
  service: 'api';
  timestamp: string;
}

@Controller('ready')
export class ReadinessController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async getReadiness(): Promise<ReadyResponse> {
    try {
      await this.prisma.client.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException('Database unreachable');
    }

    return {
      status: 'ready',
      service: 'api',
      timestamp: new Date().toISOString(),
    };
  }
}
