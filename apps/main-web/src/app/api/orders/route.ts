import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const businessId = searchParams.get('business_id');

  if (!businessId) {
    return NextResponse.json({ error: 'business_id is required' }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('business_orders')
    .select(`
      *,
      business_order_items (
        *,
        business_products (
          name,
          image_url
        )
      )
    `)
    .eq('business_id', businessId)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

interface OrderItemInput {
  id: string;
  quantity: number;
  price: number;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const body = await request.json();
  
  const { 
    business_id, 
    customer_name, 
    customer_id_number, 
    customer_phone, 
    customer_address,
    total_amount,
    payment_method_id,
    payment_reference,
    items 
  } = body;

  const itemsList = items as OrderItemInput[];

  // 1. Create the order
  const { data: order, error: orderError } = await supabase
    .from('business_orders')
    .insert([{
      business_id,
      customer_name,
      customer_id_number,
      customer_phone,
      customer_address,
      total_amount,
      payment_method_id,
      payment_reference,
      status: 'new'
    }])
    .select()
    .single();

  if (orderError) return NextResponse.json({ error: orderError.message }, { status: 500 });

  // 2. Create order items
  const orderItems = itemsList.map((item) => ({
    order_id: order.id,
    product_id: item.id,
    quantity: item.quantity,
    unit_price: item.price
  }));

  const { error: itemsError } = await supabase
    .from('business_order_items')
    .insert(orderItems);

  if (itemsError) return NextResponse.json({ error: itemsError.message }, { status: 500 });

  // 3. Descontar stock y registrar movimientos vía RPC (atómico, SECURITY DEFINER).
  //    El checkout es anónimo y no puede escribir store_inventory/inventory_logs bajo RLS;
  //    la función definer aplica el movimiento de forma segura e idempotente.
  // NOTA: cast vía `unknown` mientras se regeneran los tipos de Supabase con las nuevas RPC.
  const rpc = supabase.rpc as unknown as (
    fn: string,
    args: Record<string, unknown>
  ) => Promise<{ error: { message: string } | null }>;
  const { error: stockError } = await rpc('place_order_stock_movement', {
    p_order_id: order.id,
  });

  if (stockError) {
    return NextResponse.json({ error: stockError.message }, { status: 500 });
  }

  return NextResponse.json(order);
}
