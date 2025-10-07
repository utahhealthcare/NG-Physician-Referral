// src/app/data-access/models/physicians.ts

export interface PhysicianLocation {
  locationTitle: string;
  locationStreet?: string;
  locationCity?: string;
  locationState?: string;
  locationPostalCode?: string;
  locationUrl?: string | null;
  locationPhoneNumber?: string | null;
}

export interface PhysicianSpecialty {
  specialtyId: string;
  specialtyTitle: string;
  specialtyUrl?: string | null;
}

export interface PhysicianLanguage {
  languageTitle?: string;
}

export interface PhysicianDetailMember {
  facultyPK?: string;
  facultyId?: string;
  employeeId: string;
  preferredFullName: string;
  firstName: string;
  lastName: string;
  degrees?: string;
  clinician?: 'Y' | 'N';
  facultyStatus?: string;
  pictureUrl?: string | null;

  locationList?: { location: PhysicianLocation | PhysicianLocation[] };
  specialtyList?: { specialty: PhysicianSpecialty | PhysicianSpecialty[] };
  spokenLanguages?: { language: PhysicianLanguage | PhysicianLanguage[] };
  phoneList?: { phoneNumbers?: { cellPhone?: string } };
}

export interface PhysicianDetailRaw {
  facultyMember: PhysicianDetailMember;
}

export interface PhysicianListItemRaw {
  facultyId: string;
  employeeId: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  preferredFullName: string;
  degrees?: string;
  clinician?: 'Y' | 'N';
  facultyStatus?: string;
  lastUpdated?: string;
}

export interface PhysiciansListResponse {
  facultyMember: PhysicianListItemRaw[];
}

export interface Physician {
  facultyId: string;
  unid: string;
  fullName: string;
  firstName: string;
  lastName: string;
  degrees?: string;
  clinician?: boolean;
  status?: string;
  pictureUrl?: string | null;
  cellPhone?: string | null;
  locations?: Array<{
    title: string;
    address1?: string | null;
    address2?: string | null;
    city?: string | null;
    state?: string | null;
    zip?: string | null;
    url?: string | null;
    phone?: string | null;
  }>;
  specialties?: Array<{
    id: string;
    title: string;
    url?: string | null;
  }>;
  languages?: string[];
  lastUpdated?: number;
}

const toArray = <T>(maybe: T | T[] | undefined | null): T[] =>
  Array.isArray(maybe) ? maybe : maybe ? [maybe] : [];

const safeStr = (v: unknown): string | null =>
  typeof v === 'string' && v.trim().length ? v.trim() : null;

export const normalizePhysicianListItem = (raw: PhysicianListItemRaw): Physician => ({
  facultyId: raw.facultyId,
  unid: raw.employeeId,
  fullName: raw.preferredFullName,
  firstName: raw.firstName,
  lastName: raw.lastName,
  degrees: raw.degrees,
  clinician: raw.clinician === 'Y',
  status: raw.facultyStatus,
  lastUpdated: raw.lastUpdated ? Number(raw.lastUpdated) : undefined,
});

export const normalizePhysicianDetail = (raw: PhysicianDetailMember): Physician => {
  const locs = toArray(raw.locationList?.location).map(l => ({
    title: safeStr((l as any).locationTitle) ?? '',
    address1: safeStr((l as any).locationStreet),
    address2: null,
    city: safeStr((l as any).locationCity),
    state: safeStr((l as any).locationState),
    zip: safeStr((l as any).locationPostalCode),
    url: safeStr((l as any).locationUrl),
    phone: safeStr((l as any).locationPhoneNumber),
  }));

  const cellPhone = safeStr((raw as any).phoneList?.phoneNumbers?.cellPhone);

  return {
    facultyId: safeStr(raw.facultyPK) ?? safeStr(raw.facultyId) ?? '',
    unid: safeStr(raw.employeeId) ?? '',
    fullName: safeStr(raw.preferredFullName) ?? '',
    firstName: safeStr(raw.firstName) ?? '',
    lastName: safeStr(raw.lastName) ?? '',
    degrees: safeStr(raw.degrees) ?? undefined,
    clinician: raw.clinician === 'Y',
    status: raw.facultyStatus === 'A' ? 'Active' : safeStr(raw.facultyStatus) ?? undefined,
    pictureUrl: safeStr(raw.pictureUrl),
    cellPhone: cellPhone,
    locations: locs,
    specialties: toArray(raw.specialtyList?.specialty).map(s => ({
      id: safeStr((s as any).specialtyId) ?? '',
      title: safeStr((s as any).specialtyTitle) ?? '',
      url: safeStr((s as any).specialtyUrl),
    })),
    languages: toArray(raw.spokenLanguages?.language)
      .map(l => safeStr((l as any).languageTitle))
      .filter((x): x is string => !!x),
  };
};