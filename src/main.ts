import { bootstrapApplication } from '@angular/platform-browser';
import { App } from './app/app';
import { appConfig } from './app/app.config';

function start() {
  bootstrapApplication(App, appConfig)
    .then(() => {
      document.getElementById('pr-boot')?.remove();
    })
    .catch(err => console.error(err));
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start);
} else {
  start();
}