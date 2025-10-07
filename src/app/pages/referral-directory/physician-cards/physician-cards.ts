import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { Physician } from '../../../core/models/physicians-model';

@Component({
  selector: 'app-physician-cards',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './physician-cards.html'
})
export class PhysicianCards {
  @Input() physicians: Physician[] = [];
  @Input() loading = false;
  @Input() contextLabel: string | null = null;
  @Input() hasSearch = false;

  trackById = (_: number, p: Physician) => p.facultyId || p.unid;

  displayName(p: Physician): string {
    return p.fullName || `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim();
  }

  degrees(p: Physician): string | undefined {
    return p.degrees || undefined;
  }

  photo(p: Physician): string | null | undefined {
    return p.pictureUrl ?? null;
  }

  profileUrl(p: Physician): string | null {
    const id = p.facultyId || p.unid;
    return id ? `//healthcare.utah.edu/fad/mddetail.php?physicianID=${encodeURIComponent(id)}` : null;
  }

  phoneText(v?: string | null): string {
    if (!v) return '';
    const digits = v.replace(/\D/g, '');
    if (digits.length === 10) {
      return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    }
    return v.trim();
  }

  telHref(v?: string | null): string {
    if (!v) return '';
    // strip non-digits except + for dialing
    const digits = v.replace(/[^\d+]/g, '');
    return `tel:${digits}`;
  }

  cityState(city?: string | null, state?: string | null): string | null {
    const c = (city ?? '').trim();
    const s = (state ?? '').trim();
    if (!c && !s) return null;
    return c && s ? `${c}, ${s}` : (c || s);
  }

  cityStateZip(city?: string | null, state?: string | null, zip?: string | null): string {
    const parts: string[] = [];
    if (city) parts.push(city.trim() + (state ? ',' : ''));
    if (state) parts.push(state.trim());
    if (zip) parts.push(zip.trim());
    return parts.join(' ');
  }

  /** Print link handler */
  print(ev: Event) {
    ev.preventDefault();
    if (typeof window !== 'undefined') window.print();
  }
}