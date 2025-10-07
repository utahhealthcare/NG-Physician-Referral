import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';

@Component({
  selector: 'app-contact-info',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './contact-info.html'
})
export class ContactInfo {
  /** Handles call clicks — triggers analytics and opens tel: */
  onCall(phone: string, eventName: string): void {
    if (typeof window !== 'undefined') {
      // Push to GA or GTM dataLayer if available
      try {
        (window as any).dataLayer?.push({ event: eventName });
      } catch (err) {
        console.warn('Analytics event failed:', err);
      }
      // Initiate the phone call
      window.location.href = `tel:${phone}`;
    }
  }
}