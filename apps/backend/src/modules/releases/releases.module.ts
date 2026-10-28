import { Module } from '@nestjs/common';
import { NotificationsModule } from '../../notifications/notifications.module';
import {
  AdminReleasesController,
  ReleaseAnnounceController,
} from './releases.controller';
import { ReleasesService } from './releases.service';

@Module({
  imports: [NotificationsModule],
  controllers: [AdminReleasesController, ReleaseAnnounceController],
  providers: [ReleasesService],
})
export class ReleasesModule {}
