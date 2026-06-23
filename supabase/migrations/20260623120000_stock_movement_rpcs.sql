-- RPCs SECURITY DEFINER para el movimiento de stock.
--
-- Problema que resuelve: el checkout es anónimo (cliente anon) y chocaba con las políticas
-- RLS solo-dueño de store_inventory y con la ausencia de política INSERT en inventory_logs,
-- por lo que el stock nunca se descontaba ni se registraba (sobreventa silenciosa).
-- Al correr como SECURITY DEFINER, estas funciones aplican el movimiento de forma atómica
-- sin necesidad de abrir las políticas de escritura.

-- 1. Movimiento de stock al confirmar una orden (llamado por el checkout anónimo).
--    Idempotente: si la orden ya registró movimientos, no hace nada.
CREATE OR REPLACE FUNCTION public.place_order_stock_movement(p_order_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_business_id UUID;
    v_store_id UUID;
    v_item RECORD;
    v_current INTEGER;
    v_new INTEGER;
BEGIN
    -- Idempotencia: evitar doble descuento si se reintenta la llamada.
    IF EXISTS (SELECT 1 FROM inventory_logs WHERE order_id = p_order_id) THEN
        RETURN;
    END IF;

    SELECT business_id INTO v_business_id
    FROM business_orders
    WHERE id = p_order_id;

    IF v_business_id IS NULL THEN
        RAISE EXCEPTION 'Orden % no encontrada', p_order_id;
    END IF;

    -- Tienda principal del negocio (donde se descuenta el inventario).
    SELECT id INTO v_store_id
    FROM stores
    WHERE business_id = v_business_id AND is_main = true
    LIMIT 1;

    -- Sin tienda principal no se descuenta (mismo comportamiento previo).
    IF v_store_id IS NULL THEN
        RETURN;
    END IF;

    FOR v_item IN
        SELECT product_id, quantity
        FROM business_order_items
        WHERE order_id = p_order_id
    LOOP
        SELECT stock INTO v_current
        FROM store_inventory
        WHERE store_id = v_store_id AND product_id = v_item.product_id;

        v_current := COALESCE(v_current, 0);
        v_new := v_current - v_item.quantity;

        INSERT INTO store_inventory (store_id, product_id, stock)
        VALUES (v_store_id, v_item.product_id, v_new)
        ON CONFLICT (store_id, product_id)
        DO UPDATE SET stock = EXCLUDED.stock;

        INSERT INTO inventory_logs (
            business_id, store_id, product_id, order_id,
            change_amount, previous_quantity, new_quantity, reason
        )
        VALUES (
            v_business_id, v_store_id, v_item.product_id, p_order_id,
            -v_item.quantity, v_current, v_new, 'sale'
        );
    END LOOP;
END;
$$;

-- 2. Ajuste manual de stock desde el panel (solo dueño autenticado del negocio).
CREATE OR REPLACE FUNCTION public.adjust_store_stock(
    p_business_id UUID,
    p_store_id UUID,
    p_product_id UUID,
    p_change_amount INTEGER,
    p_reason TEXT,
    p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_current INTEGER;
    v_new INTEGER;
BEGIN
    -- Autorización explícita: la función corre como definer (omite RLS), así que
    -- verificamos a mano que el llamante sea dueño del negocio.
    IF NOT check_is_owner_of_business(p_business_id) THEN
        RAISE EXCEPTION 'No autorizado';
    END IF;

    SELECT stock INTO v_current
    FROM store_inventory
    WHERE store_id = p_store_id AND product_id = p_product_id;

    v_current := COALESCE(v_current, 0);
    v_new := v_current + p_change_amount;

    IF v_new < 0 THEN
        RAISE EXCEPTION 'Stock insuficiente para este ajuste';
    END IF;

    INSERT INTO store_inventory (store_id, product_id, stock)
    VALUES (p_store_id, p_product_id, v_new)
    ON CONFLICT (store_id, product_id)
    DO UPDATE SET stock = EXCLUDED.stock;

    INSERT INTO inventory_logs (
        business_id, store_id, product_id,
        change_amount, previous_quantity, new_quantity, reason, metadata
    )
    VALUES (
        p_business_id, p_store_id, p_product_id,
        p_change_amount, v_current, v_new, p_reason, COALESCE(p_metadata, '{}'::jsonb)
    );

    RETURN v_new;
END;
$$;

-- Permisos de ejecución: el checkout anónimo necesita place_order; el ajuste manual
-- requiere sesión autenticada (la autorización fina se valida dentro de la función).
GRANT EXECUTE ON FUNCTION public.place_order_stock_movement(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.adjust_store_stock(UUID, UUID, UUID, INTEGER, TEXT, JSONB) TO authenticated;
