import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  const supabase = await createClient();
  const body = await request.json();
  
  const { 
    business_id, 
    store_id, 
    product_id, 
    change_amount, 
    reason,
    metadata 
  } = body;

  if (!business_id || !store_id || !product_id || change_amount === undefined || !reason) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  // Ajuste atómico vía RPC (SECURITY DEFINER con verificación de dueño dentro de la función).
  // Resuelve el choque con la ausencia de política INSERT en inventory_logs bajo RLS.
  // NOTA: cast vía `unknown` mientras se regeneran los tipos de Supabase con las nuevas RPC.
  const rpc = supabase.rpc as unknown as (
    fn: string,
    args: Record<string, unknown>
  ) => Promise<{ data: number | null; error: { message: string } | null }>;
  const { data: newQuantity, error: rpcError } = await rpc('adjust_store_stock', {
    p_business_id: business_id,
    p_store_id: store_id,
    p_product_id: product_id,
    p_change_amount: change_amount,
    p_reason: reason,
    p_metadata: metadata || {},
  });

  if (rpcError) {
    // La función lanza excepciones con mensaje para "No autorizado" y "Stock insuficiente".
    const status = rpcError.message?.includes('autoriz') ? 403 : 400;
    return NextResponse.json({ error: rpcError.message }, { status });
  }

  return NextResponse.json({
    success: true,
    new_quantity: newQuantity,
  });
}
