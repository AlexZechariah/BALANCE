import type { Response } from 'express';

import { Controller, Get, Res } from '@nestjs/common';

import { apiMetrics } from './metrics';

@Controller()
export class MetricsController {
  @Get('metrics')
  async getMetrics(@Res() response: Response): Promise<void> {
    response.setHeader('Content-Type', apiMetrics.contentType);
    response.send(await apiMetrics.render());
  }
}
