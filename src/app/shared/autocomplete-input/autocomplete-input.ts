import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output, inject, OnChanges, SimpleChanges } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { debounceTime, distinctUntilChanged, switchMap, map, startWith, of, shareReplay, tap, firstValueFrom } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
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

  @Input() mode: AutoMode = 'physician';
  @Input() placeholder = 'Start typing…';
  @Input() ariaLabel = 'Search';
  @Input() minLength = 3;
  @Input() inputId?: string;
  @Input() labelId?: string;

  /**
   * External display value (human-readable).
   * If an ID is passed by mistake (e.g., u0000000 or SPECxxxxx), we resolve to a label.
   */
  @Input() value: string = '';

  /** Emits when a suggestion is chosen (ID only) */
  @Output() pick = new EventEmitter<{ type: AutoMode; id: string }>();
  /** Emits on user typing so parent can mirror the text if desired */
  @Output() valueChange = new EventEmitter<string>();

  ctrl = new FormControl<string>('');
  suggestions: Suggestion[] = [];
  open = false;
  highlighted = -1;

  private physicians$?: import('rxjs').Observable<any[]>;
  private specialties$?: import('rxjs').Observable<any[]>;

  // feedback-loop guards
  private isFocused = false;
  private lastUserValue = '';

  get hasValue(): boolean {
    const v = this.ctrl.value ?? '';
    return v.trim().length > 0;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['value']) {
      const incoming = (this.value ?? '').trim();

      // If user is actively typing, do not overwrite their input.
      if (this.isFocused) return;

      // If empty -> clear UI
      if (!incoming) {
        if ((this.ctrl.value ?? '') !== '') {
          this.ctrl.setValue('', { emitEvent: false });
        }
        this.suggestions = [];
        this.open = false;
        this.highlighted = -1;
        return;
      }

      // If the incoming value is exactly what we most recently emitted, ignore it.
      if (incoming === this.lastUserValue) return;

      // If parent passed an ID by mistake, resolve to label so users never see IDs
      if (this.isLikelyId(incoming)) {
        this.resolveLabelFromId(incoming).then(label => {
          const display = (label ?? incoming);
          if ((this.ctrl.value ?? '') !== display) {
            this.ctrl.setValue(display, { emitEvent: false });
          }
        });
      } else {
        // Normal display value
        if ((this.ctrl.value ?? '') !== incoming) {
          this.ctrl.setValue(incoming, { emitEvent: false });
        }
      }
    }
  }

  constructor() {
    this.ctrl.valueChanges
      .pipe(
        startWith(''),
        map(v => (v ?? '')),
        // keep spaces the user types (for names with spaces) but normalize comparisons
        distinctUntilChanged(),
        tap(v => {
          this.lastUserValue = v;
          this.valueChange.emit(v);
        }),
        debounceTime(120),
        switchMap(q => this.queryToSuggestions(q)),
        takeUntilDestroyed()
      )
      .subscribe((sugs: Suggestion[]) => {
        this.suggestions = sugs;
        this.open = this.suggestions.length > 0;
        this.highlighted = this.suggestions.length ? 0 : -1;
      });
  }

  // --- data sources (cached once per component instance) ---
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

  // --- search/filter pipeline ---
  private queryToSuggestions(text: string) {
    const q = (text ?? '').trim();

    if (q.length < this.minLength) {
      this.open = false;
      this.highlighted = -1;
      return of<Suggestion[]>([]);
    }

    this.open = true;

    const tokens = q.toLowerCase().split(/\s+/).filter(Boolean);
    const includesAll = (hay: string) => tokens.every(t => hay.includes(t));

    if (this.mode === 'physician') {
      return this.loadPhysicians$().pipe(
        map((list: Array<{ fullName?: string; firstName?: string; lastName?: string; unid?: string; employeeId?: string }>) => {
          const filtered = list.filter(p => {
            const full = (p.fullName || `${p.firstName ?? ''} ${p.lastName ?? ''}`).toLowerCase();
            return includesAll(full);
          });

          // Map to suggestions and de-duplicate by ID
          const byId = new Map<string, Suggestion>();
          for (const p of filtered) {
            const id = String((p as any).unid || (p as any).employeeId || '').trim();
            if (!id) continue;
            const name = (p.fullName || `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim()).trim();
            if (!name) continue;
            if (!byId.has(id)) {
              byId.set(id, {
                id,
                label: name,
                htmlLabel: this.highlightQuery(name, q),
                raw: p
              });
            }
          }
          return Array.from(byId.values()).slice(0, 8);
        })
      );
    } else {
      return this.loadSpecialties$().pipe(
        map((list: Array<{ id: string; title: string }>) => {
          const filtered = list.filter(s => includesAll(s.title.toLowerCase()));

          const byId = new Map<string, Suggestion>();
          for (const s of filtered) {
            const id = String(s.id || '').trim();
            const title = (s.title || '').trim();
            if (!id || !title) continue;
            if (!byId.has(id)) {
              byId.set(id, {
                id,
                label: title,
                htmlLabel: this.highlightQuery(title, q),
                raw: s
              });
            }
          }
          return Array.from(byId.values()).slice(0, 8);
        })
      );
    }
  }

  // --- UI events ---
  onFocus() {
    this.isFocused = true;
    this.open = this.suggestions.length > 0;
  }

  onBlur() {
    this.isFocused = false;
    // slight delay to allow click on options
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
    // Show human-readable label in the input
    this.ctrl.setValue(s.label, { emitEvent: false });
    this.lastUserValue = s.label;
    this.valueChange.emit(s.label);
    this.open = false;

    // Emit ID to the parent
    const id = String(s.id || '').trim();
    if (id) this.pick.emit({ type: this.mode, id });
  }

  clear() {
    this.ctrl.setValue('', { emitEvent: false });
    this.lastUserValue = '';
    this.valueChange.emit('');
    this.suggestions = [];
    this.open = false;
    this.highlighted = -1;
  }

  // --- helpers ---
  highlightQuery(label: string, query: string): string {
    if (!query) return label;
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escaped})`, 'ig');
    return label.replace(regex, '<strong>$1</strong>');
  }

  /** Detects an ID-like token (UNID such as u0000000 or specialty id like SPEC12345) */
  private isLikelyId(v: string): boolean {
    const s = String(v).trim();
    return /^u\d{6,8}$/i.test(s) || /^SPEC\d+/i.test(s);
    // If you also get FM000… IDs, extend here:  /^FM\d+$/i
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
    } catch {}
    return null;
  }
}