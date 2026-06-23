import { createClient } from '@/lib/supabase/server';

// Roles reales soportados por la DB (CHECK en profiles.role) y el store de admin.
// El piloto opera solo con 'owner'; 'administrative' (staff) queda diferido (P2).
export type BusinessRole = 'owner' | 'administrative';

/**
 * Valida si el usuario autenticado actual tiene un rol específico para un negocio dado.
 * @param businessId El UUID del negocio
 * @returns El rol del usuario para ese negocio, o null si no está autorizado.
 */
export async function getBusinessRole(businessId: string): Promise<BusinessRole | null> {
  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();

  if (authError || !authData?.user) {
    return null;
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('business_id', businessId)
    .eq('id', authData.user.id)
    .single();

  if (error || !data) {
    return null;
  }

  return data.role as BusinessRole;
}

/**
 * Verifica si el usuario actual es un administrador global de la plataforma.
 */
export async function isPlatformAdmin(): Promise<boolean> {
  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();

  if (authError || !authData?.user) {
    return false;
  }

  return authData.user.app_metadata?.system_role === 'superadmin';
}
