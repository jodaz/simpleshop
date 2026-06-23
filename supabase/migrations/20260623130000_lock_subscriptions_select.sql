-- Cierra la fuga de lectura cross-tenant en business_subscriptions.
--
-- Antes: "Business subscriptions are viewable by everyone" (USING true) permitía a cualquier
-- visitante anónimo enumerar el estado de plan y fecha de vencimiento de TODOS los negocios.
-- El storefront público no consume datos de suscripción (active_subscription solo se usa en
-- el panel del dueño autenticado), por lo que restringir a dueño no rompe la tienda.

DROP POLICY IF EXISTS "Business subscriptions are viewable by everyone" ON public.business_subscriptions;

CREATE POLICY "Subscriptions viewable by business owners" ON public.business_subscriptions
    FOR SELECT USING (check_is_owner_of_business(business_id));
