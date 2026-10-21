import { Module } from '@nestjs/common';
import { VisaProgramsService } from './visa-programs.service.js';

@Module({ providers: [VisaProgramsService], exports: [VisaProgramsService] })
export class VisaProgramsModule {}
