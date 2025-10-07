import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output, inject, OnChanges, SimpleChanges } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { debounceTime, distinctUntilChanged, switchMap, map, startWith, of, shareReplay, tap, firstValueFrom } from 'rxjs';
import { DirectoryApiService } from '../../core/services/physician-api';

export type AutoMode = 'physician' | 'specialty';

interface Suggestion {
  id: string;
  label: string;
  htmlLabel?: string;
  raw: any;
}

@Component({
  selector: 'app-autocomplete-input',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './autocomplete-input.html',
  styleUrl: './autocomplete-input.scss'
})
export class AutocompleteInput implements OnChanges {
  private api = inject(DirectoryApiService);

  /** Physician or Specialty suggestions */
  @Input() mode: AutoMode = 'physician';
  @Input() placeholder = 'Start typing…';
  @Input() ariaLabel = 'Search';
  @Input() minLength = 3;
  /** ID attribute for the input and the label element id */
  @Input() inputId?: string;
  @Input() labelId?: string;

  /**
   * External value for the input field (DISPLAY value).
   * NOTE: The parent can still store the selected ID in its form/state, but it should pass the
   * user-facing text here. If an ID is passed instead, we try to resolve it to a label.
   */
  @Input() value: string = '';

  /** Emits when a suggestion is chosen (emits the selected ID) */
  @Output() pick = new EventEmitter<{ type: AutoMode; id: string }>();
  /** Emits on user typing so the parent can react if needed */
  @Output() valueChange = new EventEmitter<string>();

  get hasValue(): boolean {
    return !!(this.ctrl.value && this.ctrl.value.length);
  }

  /** Textbox */
  ctrl = new FormControl<string>('');

  suggestions: Suggestion[] = [];
  open = false;
  highlighted = -1;

  private physicians$?: import('rxjs').Observable<any[]>;
  private specialties$?: import('rxjs').Observable<any[]>;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['value']) {
      const incoming = this.value ?? '';
      // If empty coming from parent: clear UI
      if (!incoming) {
        this.ctrl.setValue('', { emitEvent: false });
        this.suggestions = [];
        this.open = false;
        this.highlighted = -1;
        return;
      }

      // If parent accidentally passed an ID (u0000000 or SPECxxxxx), resolve to a label for display.
      if (this.isLikelyId(incoming)) {
        this.resolveLabelFromId(incoming).then(label => {
          const display = label || incoming; // fallback to raw
          if ((this.ctrl.value ?? '') !== display) {
            this.ctrl.setValue(display, { emitEvent: false });
          }
        });
      } else {
        // Normal case: parent passed human-readable text
        if ((this.ctrl.value ?? '') !== incoming) {
          this.ctrl.setValue(incoming, { emitEvent: false });
        }
      }
    }
  }

  private loadPhysicians$() {
    if (!this.physicians$) {
      this.physicians$ = this.api.getPhysicians().pipe(shareReplay(1));
    }
    return this.physicians$;
  }

  private loadSpecialties$() {
    if (!this.specialties$) {
      this.specialties$ = this.api.getSpecialties().pipe(shareReplay(1));
    }
    return this.specialties$;
  }

  constructor() {
    this.ctrl.valueChanges
      .pipe(
        startWith(''),
        map(v => (v ?? '').trim()),
        distinctUntilChanged(),
        tap(v => this.valueChange.emit(v)),
        debounceTime(100),
        switchMap(q => {
          const text = (q ?? '').trim();
          if (text.length < this.minLength) {
            this.suggestions = [];
            this.highlighted = -1;
            this.open = false;
            return of([]);
          }
          this.open = true;

          const tokens = text.toLowerCase().split(/\s+/).filter(Boolean);
          const includesAll = (hay: string) =>
            tokens.every(t => hay.includes(t));

          if (this.mode === 'physician') {
            return this.loadPhysicians$().pipe(
              map((list: Array<{ fullName?: string; firstName?: string; lastName?: string; unid?: string; employeeId?: string }>) => {
                const filtered = list.filter(p => {
                  const full = (p.fullName || `${p.firstName ?? ''} ${p.lastName ?? ''}`).toLowerCase();
                  return includesAll(full);
                });

                return filtered
                  .map(p => {
                    const unid = (p as any).unid || (p as any).employeeId; // internal id only (never shown)
                    if (!unid) return null;
                    const name = p.fullName || `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim();
                    return {
                      id: unid,
                      label: name,                               // visible text
                      htmlLabel: this.highlightQuery(name, text),// visible text with <strong>
                      raw: p,
                    } as Suggestion;
                  })
                  .filter(Boolean)
                  .slice(0, 8) as Suggestion[];
              })
            );
          } else {
            return this.loadSpecialties$().pipe(
              map((list: Array<{ id: string; title: string }>) => {
                const filtered = list.filter(s => includesAll(s.title.toLowerCase()));
                return filtered.slice(0, 8).map(s => ({
                  id: s.id,                                     // internal id only (never shown)
                  label: s.title,                               // visible text
                  htmlLabel: this.highlightQuery(s.title, text),
                  raw: s,
                }) as Suggestion);
              })
            );
          }
        })
      )
      .subscribe((sugs: any) => {
        this.suggestions = sugs as Suggestion[];
        this.open = this.suggestions.length > 0;
        this.highlighted = this.suggestions.length ? 0 : -1;
      });
  }

  onFocus() {
    this.open = this.suggestions.length > 0;
  }

  onBlur() {
    // slight delay to allow click
    setTimeout(() => (this.open = false), 100);
  }

  keydown(e: KeyboardEvent) {
    if (!this.open) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      this.highlighted = Math.min(this.highlighted + 1, this.suggestions.length - 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      this.highlighted = Math.max(this.highlighted - 1, 0);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const s = this.suggestions[this.highlighted];
      if (s) this.choose(s);
    } else if (e.key === 'Escape') {
      this.open = false;
    }
  }

  choose(s: Suggestion) {
    // Always display the human-readable label
    this.ctrl.setValue(s.label, { emitEvent: false });
    this.valueChange.emit(s.label);
    this.open = false;

    // Emit only the ID upward so the parent state can store the machine value
    const id = String(s.id || '').trim();
    if (id) this.pick.emit({ type: this.mode, id });
  }

  highlightQuery(label: string, query: string): string {
    if (!query) return label;
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // escape regex chars
    const regex = new RegExp(`(${escaped})`, 'ig');
    return label.replace(regex, '<strong>$1</strong>');
  }

  clear() {
    this.ctrl.setValue('', { emitEvent: false });
    this.valueChange.emit('');
    this.suggestions = [];
    this.open = false;
    this.highlighted = -1;
  }

  /** Detects an ID-like token (UNID such as u0000000 or specialty id like SPEC12345) */
  private isLikelyId(v: string): boolean {
    const s = String(v).trim();
    return /^u\d{6,8}$/i.test(s) || /^SPEC\d+/i.test(s);
  }

  /** If an ID sneaks in via [value], resolve it to the display label so users never see the ID. */
  private async resolveLabelFromId(id: string): Promise<string | null> {
    try {
      if (this.mode === 'physician') {
        const list = await firstValueFrom(this.loadPhysicians$());
        const p = list.find((item: any) => {
          const unid = (item.unid || item.employeeId || '').toString().toLowerCase();
          return unid === id.toString().toLowerCase();
        });
        if (p) {
          return (p.fullName || `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim()) || null;
        }
      } else {
        const specs = await firstValueFrom(this.loadSpecialties$());
        const s = specs.find((x: any) => (x.id || '').toString().toLowerCase() === id.toString().toLowerCase());
        if (s) return s.title || null;
      }
    } catch {
    }
    return null;
  }
}
