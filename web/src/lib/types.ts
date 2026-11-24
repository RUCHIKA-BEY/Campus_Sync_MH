// Hand-written types for the tables the frontend reads today.
// (They mirror supabase/migrations; generated types can replace them later.)

export type AppRole = 'student' | 'organizer' | 'dsa' | 'admin';

export const ROLE_LABELS: Record<AppRole, string> = {
  student: 'Student',
  organizer: 'Organizer',
  dsa: 'DSA',
  admin: 'Admin',
};

export interface Profile {
  id: string;
  role: AppRole;
  full_name: string;
  email: string;
  registration_number: string | null;
  department_id: string | null;
  academic_year: number | null;
  semester: number | null;
  phone_number: string | null;
  is_active: boolean;
}

export const PROFILE_COLUMNS =
  'id, role, full_name, email, registration_number, department_id, academic_year, semester, phone_number, is_active';

/** Columns a user may change on their own profile (enforced by GRANTs). */
export type ProfileUpdate = Partial<Pick<Profile,
  'full_name' | 'registration_number' | 'department_id' | 'academic_year' | 'semester' | 'phone_number'>>;

export interface Department { id: string; code: string; name: string }
export interface Category { id: string; name: string; slug: string }

export interface Club {
  id: string;
  name: string;
  short_name: string;
  description: string | null;
  category: { name: string; slug: string } | null;
}
