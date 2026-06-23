# Auditoría de seguridad y plan de endurecimiento (pilot)

> Documento de ingeniería / bitácora de decisiones. Captura el estado real del código,
> los hallazgos verificados, el backlog priorizado y el plan a nivel de archivo para el
> hito **"hacer el piloto seguro"**.
>
> Fecha de análisis: 2026-06-23 · Rama: `develop`

## 1. Contexto y decisiones tomadas

- **Go-to-market cercano:** piloto con unas pocas tiendas amigas (rollout controlado, se toleran asperezas mientras se itera).
- **Modelo de autorización elegido:** defensa en profundidad — mantener RLS *y además* validar auth + propiedad + entrada (Zod) en las rutas de API.
- **Modelo de roles para el piloto:** **solo `owner`** (sin cuentas de staff por ahora). El staff con permisos limitados se difiere a P2.
- **Arreglo de checkout/stock:** vía **RPC** de Postgres (`SECURITY DEFINER`), no trigger.

## 2. Aclaración clave del modelo de seguridad

Todas las rutas en `src/app/api/**` usan el cliente **anon + cookie de sesión** del usuario
(`src/lib/supabase/server.ts` — no existe ningún cliente con `service_role` en el repo).
Esto significa que **RLS es la capa de cumplimiento real**, no un complemento. Consecuencias:

- Las afirmaciones de "cualquiera puede escribir datos de cualquier negocio" son en su
  mayoría **falsas** para escrituras: las políticas `check_is_owner_of_business` bloquean
  a no-dueños en la base de datos.
- El acceso admin **no** es cross-tenant: `admin/(dashboard)/layout.tsx` enlaza al usuario
  con el slug del tenant vía `getBusinessRole(business.id)` en el servidor. Esto es sólido.
- El chequeo de cookie en el edge (`middleware.ts:57-65`) es **solo UX** — la autorización
  real vive en el layout. No "arreglar", solo documentar.
- El riesgo real se concentra en: (a) políticas SELECT demasiado permisivas (fuga de lectura
  cross-tenant), y (b) la ruta de escritura de stock del checkout (ver §3, Bug #1).

## 3. Bugs en vivo (rompen el piloto — verificar contra DB real)

### Bug #1 — El checkout sobrevende en silencio  🔴 P0
`src/app/api/orders/route.ts:89-130`. El POST de checkout es **anónimo** (cliente anon), pero:

- `store_inventory` upsert (línea 109) → choca con la política **solo-dueño**
  `"Owners can manage inventory"` (`fix_inventory_rls`) → denegado para anon.
- `inventory_logs` insert (línea 117) → **no existe política INSERT**
  (`add_orders_and_stock_logs:47` habilita RLS; solo hay SELECT en `:62`) → denegado.
- **Ninguna de las tres llamadas `await` verifica `error`** — los resultados se descartan.

Resultado: la orden se crea, pero **el stock nunca se descuenta ni se registra el log**.
Sobreventa silenciosa. El mismo INSERT-denegado afecta a `/api/inventory/adjust`.

### Bug #2 — Las invitaciones de staff son puro mock  🟡 (mitigado por decisión owner-only)
`src/app/sites/[tenant]/admin/(dashboard)/settings/users/new/page.tsx:41-47` no llama a
ninguna API: hace `addProfile` sobre el estado local de Zustand con un `setTimeout`. No
existe backend de invitación de usuarios. Con la decisión **owner-only**, esto deja de ser
urgente, pero la opción "Editor" del formulario es engañosa (ver R1).

## 4. Fuga de lectura cross-tenant (privacidad — importa incluso en piloto)  🟠 P0

Con la anon key (que viaja al navegador), cualquiera puede enumerar datos de **todos** los
tenants por estas políticas `SELECT USING (true)`:

- `business_payment_methods` — `multi_store_refactor:109` (¡detalles de pago de todos!)
- `business_settings` — `multi_store_refactor:108`
- `business_subscriptions` — `add_subscription_plans:46` (estado de plan / vencimiento)

El storefront necesita *parte* de esto, pero no lectura cross-tenant sin restricción.

## 5. Contradicción del modelo de roles (deuda, no bug con owner-only)

Tres definiciones que no concuerdan:

| Fuente | Valores |
|---|---|
| DB `CHECK` (`multi_store_refactor:65`) | `'owner'`, `'administrative'` |
| `src/stores/adminStore.ts:4` | `'owner'`, `'administrative'` ✓ |
| `src/lib/supabase/rbac.ts:3` | `'owner'`, `'admin'`, `'manager'`, `'staff'` ✗ |
| `check_is_owner_of_business` (`multi_store_refactor:116`) | solo concede a `role = 'owner'` |

Además, el `CHECK` exige que las filas `administrative` tengan `assigned_store_id` no nulo
(`multi_store_refactor:70`) — la intención del esquema es staff con alcance a una tienda.
Con owner-only, `rbac.ts` es el único outlier a corregir (R1).

## 6. Otros hallazgos (defensa en profundidad / calidad)

- **Sin autorización a nivel de app ni validación Zod** en las rutas de escritura
  (`products`, `categories`, `stores`, `payment-methods`, `inventory/adjust`, `orders/[id]`,
  `businesses/settings`, `admin/subscriptions/change`). Zod está instalado pero no se usa en
  ninguna ruta. → R4 (P1).
- **`admin/subscriptions/change/route.ts`** tiene un chequeo de auth explícitamente sin
  terminar (comentario "NOTE: Adjust the auth check…"). → se cierra en R4.
- **`/api/upload/route.ts`**: sin auth, sin validación de tipo/tamaño de archivo, nombres con
  `Math.random()`; las políticas del bucket de Storage **no están versionadas** en el repo
  (probablemente configuradas en el dashboard de Supabase). → R5 (P1).
- **Dashboard con datos mock**: `admin/(dashboard)/page.tsx` muestra KPIs fabricados
  (ventas, clientes, ingresos, sparklines) sin conexión a datos reales. → R6 (P2).
- **Rendimiento**: suma de stock en JS en `products/route.ts` (debería ser SQL); loop N+1 en
  el descuento de stock del checkout (se resuelve con la RPC de R2). → R7 (P2).

## 7. Backlog priorizado

**P0 — antes de invitar a las tiendas amigas**
- **R1** — Reconciliar el modelo de roles a `owner | administrative`, manteniendo todo
  owner-only.
- **R2** — Arreglar la ruta de escritura de stock (checkout + adjust) vía RPC `SECURITY DEFINER`.
- **R3** — Cerrar la fuga de lectura cross-tenant (políticas SELECT permisivas).

**P1 — endurecimiento (antes de escalar más allá del piloto)**
- **R4** — Auth + propiedad + Zod en todas las rutas de escritura (incl. cerrar el chequeo
  pendiente de `admin/subscriptions/change`).
- **R5** — Validación en `/api/upload` y confirmar/versionar las políticas del bucket.

**P2 — completitud de producto / pulido**
- **R6** — Reemplazar los KPIs mock del dashboard por queries reales.
- **R7** — Limpieza de rendimiento (suma de stock en SQL; el N+1 lo absorbe R2).
- **Staff (diferido):** RLS de acceso staff + backend real de invitación + alcance por tienda.

**P3 — fuera del alcance del piloto**
- Consola `apps/saas-admin` (scaffold vacío de Vite).
- Automatización de facturación/renovación de suscripciones.
- Subida de captura de pago en checkout ("Próximamente", `CheckoutForm.tsx`).

## 8. Plan a nivel de archivo — hito "hacer el piloto seguro" (R1–R3)

> **Estado (2026-06-23):** R1 ✅, R2 ✅, R3a ✅ implementados y verificados con `tsc` + `lint`
> (sin errores nuevos). R3b queda especificado pero **sin aplicar** (requiere DB en vivo).
> Archivos tocados: `rbac.ts`, `settings/users/new/page.tsx`, `api/orders/route.ts`,
> `api/inventory/adjust/route.ts`, y migraciones `20260623120000_stock_movement_rpcs.sql` y
> `20260623130000_lock_subscriptions_select.sql`.

Secuencia: **R1 → R2 → R3**.

### R1 — Modelo de roles canónico (`owner | administrative`, todo owner-only)
- `src/lib/supabase/rbac.ts:3` — cambiar `BusinessRole` a `'owner' | 'administrative'`
  (eliminar `admin | manager | staff`). Es el único outlier; `adminStore.ts:4` y el `CHECK`
  de la DB ya coinciden.
- **RLS:** sin cambios. `check_is_owner_of_business` ya implementa owner-only correctamente.
- **Limpieza de UI engañosa:** en `settings/users/new/page.tsx` ocultar/retirar la opción
  "Editor (Acceso a Inventario y Pedidos)" o marcar la página como no funcional, ya que no
  existe backend de invitación y solo `owner` está soportado en el piloto.
- *Nota diferida:* la restricción `assigned_store_id` para `administrative`
  (`multi_store_refactor:70`) se revisará cuando se implemente staff (P2).

### R2 — Arreglar la escritura de stock vía RPC (`SECURITY DEFINER`)
- Nueva migración: función `place_order_stock_movement(p_order_id uuid)` (o similar),
  `SECURITY DEFINER`, que dentro de una transacción:
  1. recorre `business_order_items` de la orden,
  2. descuenta `store_inventory` de la tienda principal,
  3. inserta las filas en `inventory_logs` (`reason = 'sale'`).
  Al correr como definer, evita las políticas owner-only de forma segura y es atómica.
- `src/app/api/orders/route.ts` — reemplazar el loop `:97-130` por una sola llamada
  `supabase.rpc('place_order_stock_movement', { p_order_id: order.id })` y **verificar el
  `error`** (hoy se descarta). Esto también elimina el N+1 (R7).
- `src/app/api/inventory/adjust/route.ts` — encaminar el ajuste manual por una RPC análoga
  (p. ej. `adjust_store_stock(...)`) en lugar de inserts crudos, para que el log no choque
  con la ausencia de política INSERT en `inventory_logs`.
- **No** añadir una política INSERT amplia en `inventory_logs`: dejar las escrituras
  exclusivamente vía definer mantiene el log a prueba de manipulación.

### R3 — Cerrar la fuga de lectura cross-tenant

**R3a — `business_subscriptions` (HECHO).** `add_subscription_plans:46` tenía `USING (true)`.
Migración `20260623130000_lock_subscriptions_select.sql` la reemplaza por acceso owner
(`check_is_owner_of_business(business_id)`). Verificado en código: `active_subscription` (de
`getBusinessBySlug`) no se consume en ninguna página pública — solo en el panel del dueño
autenticado — por lo que restringir no rompe el storefront.

**R3b — `business_settings` + `business_payment_methods` (PENDIENTE, requiere DB en vivo).**
Hallazgo arquitectónico: estos datos **deben** ser legibles por anónimos para el tenant que
se está viendo (el comprador necesita los datos de pago en el checkout), pero una petición
anónima **no lleva contexto de tenant a nivel de DB** (el tenant solo se conoce por el host en
el middleware). Por tanto **RLS no puede distinguir "el tenant que se ve" de "otro tenant"**:
cualquier política lo bastante permisiva para que el storefront lea sus métodos (anon) lo es
también para leer los de otro negocio. RLS por sí sola no cierra esta fuga.

Fix correcto (mismo patrón definer que R2): una RPC `SECURITY DEFINER`
`get_public_storefront(slug)` que arme el payload público de **un solo** tenant, y luego
restringir el SELECT de ambas tablas a owner. Requiere recablear `getBusinessBySlug` y
`getPaymentMethodsForBusiness` en `lib/api/business.ts` **manteniendo la forma de retorno
idéntica**, y probar el storefront end-to-end. No se aplicó a ciegas por falta de DB en vivo
(romper el storefront sería peor que la fuga actual de datos semi-públicos de checkout).

## 9. Verificación pendiente contra DB en vivo (hoy solo schema)

1. Aplicar las migraciones `20260623120000` y `20260623130000` a la DB del piloto.
2. Tras R2, probar un checkout end-to-end: verificar que el stock se descuenta y que se
   inserta el `inventory_logs` con `reason = 'sale'` (confirma que Bug #1 quedó resuelto).
3. Probar un ajuste manual de stock: verificar que un no-dueño recibe "No autorizado" (403)
   y que un stock negativo recibe "Stock insuficiente" (400).
4. Confirmar que las políticas de Storage del bucket de uploads existen (no están en el repo) → R5.
5. Regenerar los tipos de Supabase (`supabase gen types`) para eliminar los casts `unknown`
   de las RPC en `api/orders/route.ts` y `api/inventory/adjust/route.ts`.
6. Implementar R3b (`get_public_storefront` RPC) y verificar que el storefront público sigue
   mostrando ajustes, métodos de pago y settings del tenant correcto.

## 10. Bitácora de decisiones

| Fecha | Decisión | Razón |
|---|---|---|
| 2026-06-23 | Owner-only en el piloto; staff a P2 | No hay backend de invitación real; reduce alcance y riesgo |
| 2026-06-23 | Defensa en profundidad (RLS + auth/Zod en rutas) | Hoy todo depende de que RLS sea correcto; una política mala = brecha |
| 2026-06-23 | Arreglo de stock vía RPC `SECURITY DEFINER` | Más fácil de depurar/llamar explícitamente que un trigger; atómico; evita abrir políticas de escritura |
| 2026-06-23 | Mantener valor DB `administrative` (no renombrar a `staff`) | Evita migración de valores pre-piloto; renombrado cosmético posible luego |
