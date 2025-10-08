import { inject, Injectable, signal } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { firstValueFrom, Observable, of } from 'rxjs';
import { map, shareReplay, take } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { forkJoin } from 'rxjs';
import {
  SpecialtiesResponse,
  SpecialtyItem,
  SpecialtyItemRaw,
  normalizeSpecialty,
} from '../models/specialties-model';
import {
  PhysiciansListResponse,
  Physician,
  PhysicianDetailRaw,
  PhysicianDetailMember,
  normalizePhysicianListItem,
  normalizePhysicianDetail,
} from '../models/physicians-model';

@Injectable({ providedIn: 'root' })
export class DirectoryApiService {
  private http = inject(HttpClient);
  private _warmed$?: import('rxjs').Observable<void>;
  private specialtyReqCache = new Map<string, Observable<Physician[]>>();

  /** In-memory caches for list endpoints (warmed at startup) */
  specialtiesCache = signal<SpecialtyItem[] | null>(null);
  physiciansCache  = signal<Physician[] | null>(null);

  /** Fast lookup maps derived from caches */
  private specialtyById = signal<Map<string, SpecialtyItem>>(new Map());
  private physicianByUnid = signal<Map<string, Physician>>(new Map());

  /** Case-insensitive de-dupe by key */
  private dedupe<T>(arr: T[], key: (x: T) => string | undefined | null): T[] {
    const seen = new Set<string>();
    const out: T[] = [];
    for (const item of arr) {
      const k = (key(item) ?? '').trim().toLowerCase();
      if (!k || seen.has(k)) continue;
      seen.add(k);
      out.push(item);
    }
    return out;
  }

  /** ===== Specialties ===== */
  getSpecialties(): Observable<SpecialtyItem[]> {
    const url = environment.specialtiesAPI;
    return this.http.get<SpecialtiesResponse>(url).pipe(
      map(res => (res?.specialtySubSpecialty ?? []).map((s: SpecialtyItemRaw) => normalizeSpecialty(s))),
      map(list => this.dedupe(list, s => s.id)),
      shareReplay({ bufferSize: 1, refCount: true })
    );
  }

  /** ===== Physicians (list + detail) ===== */
  getPhysicians(): Observable<Physician[]> {
    const url = environment.physiciansAPI;
    return this.http.get<PhysiciansListResponse>(url).pipe(
      map(res => (res?.facultyMember ?? []).map(normalizePhysicianListItem)),
      map(list => this.dedupe(list, p => p.unid || p.facultyId)),
      shareReplay({ bufferSize: 1, refCount: true })
    );
  }

  /**
   * Physicians for a given specialty id (SPEC…). API returns detail-like members.
   * Per-id request is cached. Results are normalized & deduped.
   */
  getPhysiciansForSpecialty(specialtyId: string): Observable<Physician[]> {
    const id = (specialtyId || '').trim();
    if (!id) return of([]);

    const cached = this.specialtyReqCache.get(id);
    if (cached) return cached;

    const url = environment.specialtyAPI;
    const params = new HttpParams().set('id', id);

    const req$ = this.http
      .get<{ facultyMember?: PhysicianDetailMember | PhysicianDetailMember[] }>(url, { params })
      .pipe(
        map(res => {
          const members = Array.isArray(res?.facultyMember)
            ? res!.facultyMember
            : res?.facultyMember ? [res.facultyMember] : [];
          const normalized = members.map(m => normalizePhysicianDetail(m));
          return this.dedupe(normalized, p => p.unid || p.facultyId);
        }),
        shareReplay({ bufferSize: 1, refCount: true })
      );

    this.specialtyReqCache.set(id, req$);
    return req$;
  }

  /**
   * Physician detail by uNID (employeeId), e.g. ?id=u0028311.
   * Returns normalized detail.
   */
  getPhysicianByUnid(unid: string): Observable<Physician> {
    const id = (unid || '').trim();
    const url = environment.physicianAPI;
    const params = new HttpParams().set('id', id);
    return this.http.get<PhysicianDetailRaw>(url, { params }).pipe(
      map(res => normalizePhysicianDetail(res.facultyMember))
    );
  }

  /**
   * Optional: “complete list” feed (historical). Deduped.
   */
  getPhysiciansCompleteList(): Observable<Physician[]> {
    const url = environment.physiciansBySpecialtyAPI;
    return this.http.get<any>(url).pipe(
      map(res => (res?.facultyMember ?? []).map(normalizePhysicianListItem)),
      map(list => this.dedupe(list, p => p.unid || p.facultyId))
    );
  }

  /** Client-side filter across a list by specialty id */
  filterPhysiciansBySpecialty(list: Physician[], specId: string): Physician[] {
    const id = (specId || '').trim();
    if (!id) return [];
    return list.filter(p => p.specialties?.some(s => s.id === id));
  }

  /** ===== Cache warming / lookup ===== */

  /**
   * Warm both list caches; build lookup maps. Await during bootstrap if you want zero-jitter autocompletes.
   */
  async warmCaches(): Promise<void> {
    const [specialties, physicians] = await Promise.all([
      firstValueFrom(this.getSpecialties()),
      firstValueFrom(this.getPhysicians()),
    ]);

    this.specialtiesCache.set(specialties);
    this.physiciansCache.set(physicians);

    // Build lookup maps
    const sMap = new Map<string, SpecialtyItem>();
    for (const s of specialties) sMap.set(s.id, s);
    this.specialtyById.set(sMap);

    const pMap = new Map<string, Physician>();
    for (const p of physicians) {
      const key = (p.unid || p.facultyId || '').trim();
      if (key) pMap.set(key, p);
    }
    this.physicianByUnid.set(pMap);
  }

  /** Sync helpers to avoid extra HTTP calls in components */

  getCachedSpecialties(): SpecialtyItem[] {
    return this.specialtiesCache() ?? [];
  }

  getCachedPhysicians(): Physician[] {
    return this.physiciansCache() ?? [];
  }

  /** Resolve specialty title for a context label, using cache or network fallback */
  getSpecialtyTitle$(id: string): Observable<string | null> {
    const cached = this.specialtyById().get((id || '').trim());
    if (cached) return of(cached.title);
    return this.getSpecialties().pipe(
      map(list => {
        const found = list.find(s => s.id === id);
        return found ? found.title : null;
      })
    );
  }

  /** Resolve physician display name from cached list (best-effort) */
  getPhysicianNameFromCache(unidOrFacultyId: string): string | null {
    const key = (unidOrFacultyId || '').trim();
    if (!key) return null;
    const hit = this.physicianByUnid().get(key);
    if (!hit) return null;
    return hit.fullName || `${hit.firstName ?? ''} ${hit.lastName ?? ''}`.trim() || null;
  }

  warmCachesOnce() {
    if (!this._warmed$) {
      this._warmed$ = forkJoin([
        this.getSpecialties().pipe(take(1)),
        this.getPhysicians().pipe(take(1))
      ]).pipe(map(() => void 0), shareReplay({ bufferSize: 1, refCount: true }));
    }
    return this._warmed$;
  }
}