import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output, OnChanges, SimpleChanges } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { AutocompleteInput } from '../../../shared/autocomplete-input/autocomplete-input';

export type FilterChange = { type: 'physician' | 'specialty'; id: string };

@Component({
  selector: 'app-filters',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, AutocompleteInput],
  templateUrl: './filters.html',
  styleUrl: './filters.scss'
})
export class Filters implements OnChanges {
  /** Controlled by the page via query params */
  @Input() selectedPhysician: string | null = null;
  @Input() selectedSpecialty: string | null = null;

  /** Emit when the user applies a filter */
  @Output() filterChange = new EventEmitter<FilterChange>();

  /**
   * Simple form; IDs for now.
   * Autocomplete wires through pick and valueChange.
   */
  form = new FormGroup({
    physicianId: new FormControl<string>(''),
    specialtyId: new FormControl<string>(''),
  });

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['selectedPhysician']) {
      if (this.selectedPhysician) {
        this.form.patchValue({ physicianId: this.selectedPhysician, specialtyId: '' }, { emitEvent: false });
      }
    }
    if (changes['selectedSpecialty']) {
      if (this.selectedSpecialty) {
        this.form.patchValue({ specialtyId: this.selectedSpecialty, physicianId: '' }, { emitEvent: false });
      }
    }
    if (this.selectedPhysician == null && this.selectedSpecialty == null) {
      this.form.reset({ physicianId: '', specialtyId: '' }, { emitEvent: false });
    }
  }

  onPhysicianPick(e: { type: 'physician' | 'specialty'; id: string }) {
    if (e?.type !== 'physician') return;           // runtime guard
    const id = (e.id || '').trim();
    if (!id) return;
    this.form.patchValue({ physicianId: id, specialtyId: '' });
    this.filterChange.emit({ type: 'physician', id });
  }

  onSpecialtyPick(e: { type: 'physician' | 'specialty'; id: string }) {
    if (e?.type !== 'specialty') return;           // runtime guard
    const id = (e.id || '').trim();
    if (!id) return;
    this.form.patchValue({ specialtyId: id, physicianId: '' });
    this.filterChange.emit({ type: 'specialty', id });
  }

  /** Raw typing helpers (optional if your autocomplete emits only on pick) */
  onPhysicianInput(val: string) {
    if ((val || '').trim().length) {
      this.form.patchValue({ specialtyId: '' });
    }
  }

  onSpecialtyInput(val: string) {
    if ((val || '').trim().length) {
      this.form.patchValue({ physicianId: '' });
    }
  }

  /**
   * Fired on raw typing in the Physician autocomplete (via (valueChange)).
   * If the user has typed anything non-empty, clear the Specialty input locally
   * (no parent emission yet; we only emit on pick).
   */
  onPhysicianType(value: string) {
    const v = (value || '').trim();
    if (v.length > 0) {
      this.form.patchValue({ specialtyId: '' }, { emitEvent: false });
    }
  }

  /**
   * Fired on raw typing in the Specialty autocomplete (via (valueChange)).
   * If the user has typed anything non-empty, clear the Physician input locally
   * (no parent emission yet; we only emit on pick).
   */
  onSpecialtyType(value: string) {
    const v = (value || '').trim();
    if (v.length > 0) {
      this.form.patchValue({ physicianId: '' }, { emitEvent: false });
    }
  }

  /** For explicit Clear buttons */
  clearPhysician() {
    this.form.patchValue({ physicianId: '' });
  }

  clearSpecialty() {
    this.form.patchValue({ specialtyId: '' });
  }
}
