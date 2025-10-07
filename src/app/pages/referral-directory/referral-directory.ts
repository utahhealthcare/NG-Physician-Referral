import { CommonModule } from '@angular/common';
import { Component, computed, effect, signal } from '@angular/core';
import { Filters, FilterChange } from './filters/filters';
import { PhysicianCards } from './physician-cards/physician-cards';
import { DirectoryApiService } from '../../core/services/physician-api';
import { ContactInfo } from './contact-info/contact-info';
import { Billboard } from './billboard/billboard';
import { Physician } from '../../core/models/physicians-model';

@Component({
  selector: 'app-referral-directory',
  standalone: true,
  imports: [CommonModule, Filters, PhysicianCards, ContactInfo, Billboard],
  templateUrl: './referral-directory.html'
})
export class ReferralDirectory {
  selectedPhysician = signal<string | null>(null);
  selectedSpecialty = signal<string | null>(null);
  loading = signal(false);
  physicians = signal<Physician[]>([]);

  private lastPickedLabel = signal<string | null>(null);

  contextLabel = computed(() => {
    const hasSelection = !!this.selectedPhysician() || !!this.selectedSpecialty();
    return hasSelection ? this.lastPickedLabel() : null;
  });

  constructor(private api: DirectoryApiService) {
    effect(() => {
      const p = this.selectedPhysician();
      const s = this.selectedSpecialty();

      if (!p && !s) {
        this.physicians.set([]);
        this.lastPickedLabel.set(null);
        this.loading.set(false);
        return;
      }

      this.loading.set(true);

      if (p) {
        this.api.getPhysicianByUnid(p).subscribe({
          next: (doc: Physician | null) => {
            this.physicians.set(doc ? [doc] : []);
            this.setContextLabelFromPhysician(doc || undefined);
            this.loading.set(false);
          },
          error: () => this.loading.set(false),
        });
      } else if (s) {
        this.api.getPhysiciansForSpecialty(s).subscribe({
          next: (list: Physician[]) => {
            this.physicians.set(list ?? []);
            this.setContextLabelFromSpecialtyId(s);
            this.loading.set(false);
          },
          error: () => this.loading.set(false),
        });
      }
    });
  }

  onFilterChange(e: FilterChange & { label?: string }) {
    if (e.type === 'physician') {
      this.selectedPhysician.set(e.id);
      this.selectedSpecialty.set(null);
      if (e.label) this.lastPickedLabel.set(e.label);
    } else {
      this.selectedSpecialty.set(e.id);
      this.selectedPhysician.set(null);
      if (e.label) this.lastPickedLabel.set(e.label);
      this.setContextLabelFromSpecialtyId(e.id);
    }
  }

  private setContextLabelFromPhysician(doc?: Physician | null): void {
    if (!doc) return;
    const name = doc.fullName || `${doc.firstName ?? ''} ${doc.lastName ?? ''}`.trim();
    if (name) this.lastPickedLabel.set(name);
  }

  private setContextLabelFromSpecialtyId(id: string): void {
    if (!id) return;

    const findTitle = (list: Array<{ id: string; title: string; ufisId?: string | null }>) => {
      const hit = list.find(s => s.id === id || (s.ufisId ?? null) === id);
      return hit?.title ?? null;
    };

    const cached = this.api.specialtiesCache?.() || null;
    if (cached?.length) {
      const t = findTitle(cached);
      if (t) { this.lastPickedLabel.set(t); return; }
    }

    this.api.getSpecialties().subscribe(list => {
      const t = findTitle(list);
      if (t) this.lastPickedLabel.set(t);
    });
  }
}