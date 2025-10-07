import { ApplicationConfig, provideAppInitializer, inject, provideZonelessChangeDetection } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { DirectoryApiService } from './core/services/physician-api';

export const appConfig: ApplicationConfig = {
  providers: [
    provideHttpClient(),
    DirectoryApiService,
    provideZonelessChangeDetection(),
    provideAppInitializer(async () => {
      await inject(DirectoryApiService).warmCaches();
    }),
    
  ],
};
