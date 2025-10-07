import { inject, Injectable, signal } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { map, shareReplay } from 'rxjs/operators';
import { Observable, of } from 'rxjs';
import { environment } from '../../../environments/environment';
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

  /** In-flight/result cache keyed by specialty id to avoid duplicate requests */
  private specialtyReqCache = new Map<string, Observable<Physician[]>>();

  /** Deduplicate helper by unique string key */
  private dedupe<T>(arr: T[], key: (x: T) => string): T[] {
    const seen = new Set<string>();
    return arr.filter(item => {
      const id = (key(item) || '').trim();
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }

  getSpecialties(): Observable<SpecialtyItem[]> {
    const url = environment.specialtiesAPI;
    return this.http.get<SpecialtiesResponse>(url).pipe(
      map(res => (res?.specialtySubSpecialty ?? []).map((s: SpecialtyItemRaw) => normalizeSpecialty(s))),
      map(list => this.dedupe(list, s => s.id)),
      shareReplay({ bufferSize: 1, refCount: true })
    );
  }

  /**
   * Returns physicians for a given specialty id.
   * NOTE: per API quirk, specialty-json.php?id=SPEC... returns physicians.
   * Cached per specialty to prevent duplicate HTTP calls; results are de-duplicated.
   */
  getPhysiciansForSpecialty(specialtyId: string): Observable<Physician[]> {
    const id = (specialtyId || '').trim();
    if (!id) return of([] as Physician[]);

    const cached = this.specialtyReqCache.get(id);
    if (cached) return cached;

    const url = environment.specialtyAPI; // .../specialty-json.php
    const params = new HttpParams().set('id', id);

    const req$ = this.http
      .get<{ facultyMember?: PhysicianDetailMember | PhysicianDetailMember[] }>(url, { params })
      .pipe(
        map(res => {
          const members = Array.isArray(res?.facultyMember)
            ? res!.facultyMember
            : res?.facultyMember
              ? [res.facultyMember]
              : [];
          const normalized = members.map(m => normalizePhysicianDetail(m));
          return this.dedupe(normalized, p => p.unid || p.facultyId);
        }),
        shareReplay({ bufferSize: 1, refCount: true })
      );

    this.specialtyReqCache.set(id, req$);
    return req$;
  }

  /** ======== Physicians (list + detail) ======== */
  getPhysicians(): Observable<Physician[]> {
    const url = environment.physiciansAPI; // .../physicians-json.php
    return this.http.get<PhysiciansListResponse>(url).pipe(
      map(res => (res?.facultyMember ?? []).map(normalizePhysicianListItem)),
      map(list => this.dedupe(list, p => p.unid || p.facultyId)),
      shareReplay({ bufferSize: 1, refCount: true })
    );
  }

  /**
   * Physician detail by uNID (employeeId), e.g. ?id=u0028311
   */
  getPhysicianByUnid(unid: string): Observable<Physician> {
    const url = environment.physicianAPI; // .../physician-json.php
    const params = new HttpParams().set('id', unid);
    return this.http.get<PhysicianDetailRaw>(url, { params }).pipe(
      map(res => normalizePhysicianDetail(res.facultyMember))
    );
  }

  /**
   * Optional: consume the "complete list" feed (historical) then filter client-side by speciality id(s).
   * Useful if specialty endpoint throttles or lacks a needed filter.
   */
  getPhysiciansCompleteList(): Observable<Physician[]> {
    const url = environment.physiciansBySpecialtyAPI; // complete_list.json
    return this.http.get<any>(url).pipe(
      map(res => (res?.facultyMember ?? []).map(normalizePhysicianListItem)),
      map(list => this.dedupe(list, p => p.unid || p.facultyId))
    );
  }

  /**
   * Client-side filter across the complete list by any SpecialtyId (SPEC...).
   */
  filterPhysiciansBySpecialty(list: Physician[], specId: string): Physician[] {
    return list.filter(p => p.specialties?.some(s => s.id === specId));
  }

  specialtiesCache = signal<SpecialtyItem[] | null>(null);
  physiciansCache = signal<Physician[] | null>(null);

  warmCaches(): void {
    this.getSpecialties().subscribe(v => this.specialtiesCache.set(v));
    this.getPhysicians().subscribe(v => this.physiciansCache.set(v));
  }
}