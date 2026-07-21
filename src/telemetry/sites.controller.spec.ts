import { Test, TestingModule } from '@nestjs/testing';
import { SitesController } from './sites.controller';
import { TelemetryService } from './telemetry.service';

describe('SitesController', () => {
  let controller: SitesController;
  const telemetryService = { getSummary: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SitesController],
      providers: [{ provide: TelemetryService, useValue: telemetryService }],
    }).compile();

    controller = module.get<SitesController>(SitesController);
    jest.clearAllMocks();
  });

  it('returns the site summary for the requested range', async () => {
    const query = {
      from: '2026-07-21T10:00:00.000Z',
      to: '2026-07-21T11:00:00.000Z',
    };
    const summary = { count: 1 };
    telemetryService.getSummary.mockResolvedValue(summary);

    await expect(controller.summary({ siteId: 'site-1' }, query)).resolves.toBe(
      summary,
    );
    expect(telemetryService.getSummary).toHaveBeenCalledWith('site-1', query);
  });
});
