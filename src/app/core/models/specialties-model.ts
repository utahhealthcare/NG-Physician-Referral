export interface SpecialtyItemRaw {
  specialtySubSpecialtyId: string;
  ufisSpecialtyId: string | null;
  specialtySubSpecialtyTitle: string;
  specialtySubSpecialtyUrl: string | null;
  meshCode: string | null;
  lineageVer3ParentSpecialtyID: string | null;
  lineageVer2ParentSpecialtyPK: string | null;
  lineageVer3ParentSpecialtyName: string | null;
  lineageVer3SpecialtyName: string | null;
  lineageVer3SpecialtyID: string | null; // ufis v3 id
  lineageVer2SpecialtyPK: string | null;
  lineageVer2SpecialtyName: string | null;
  lineageVer2SubSpecialtyPK: string | null;
  lineageVer2SubSpecialtyName: string | null;
  lineageVer1SpecialtyPK: string | null;
  lineageVer1SubSpecialtyPK: string | null;
  lineageIsSubSpecialtyFlag: 'Y' | 'N';
  lineageMeshKey: string | null;
}

export interface SpecialtiesResponse {
  specialtySubSpecialty: SpecialtyItemRaw[];
}

export interface SpecialtyItem {
  id: string;
  title: string;
  url?: string | null;
  parentName?: string | null;
  isSubSpecialty: boolean;
  ufisId?: string | null;
}

export const normalizeSpecialty = (raw: SpecialtyItemRaw): SpecialtyItem => ({
  id: raw.specialtySubSpecialtyId,
  title: raw.specialtySubSpecialtyTitle,
  url: raw.specialtySubSpecialtyUrl,
  parentName: raw.lineageVer3ParentSpecialtyName,
  isSubSpecialty: raw.lineageIsSubSpecialtyFlag === 'Y',
  ufisId: raw.ufisSpecialtyId,
});