import { Component, signal } from '@angular/core';
import { ReferralDirectory } from "./pages/referral-directory/referral-directory";

@Component({
  selector: 'app-physician-referral',
  imports: [ReferralDirectory],
  template: '<app-referral-directory></app-referral-directory>'
})
export class App {
  protected readonly title = signal('Physician Referral');
}
