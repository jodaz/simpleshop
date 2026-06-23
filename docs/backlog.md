# Backlog de tickets — endurecimiento y piloto

> Backlog derivado de `docs/security_audit_and_hardening_plan.md`. Convención de prioridad:
> **P0** = bloquea el piloto · **P1** = antes de escalar · **P2** = completitud/pulido ·
> **P3** = fuera del alcance del piloto. Esfuerzo: **S** (<½d) · **M** (½–2d) · **L** (>2d).
>
> Última actualización: 2026-06-23 · Rama: `develop`

## Resumen

| ID | Título | Prio | Estado | Esfuerzo | Depende de |
|----|--------|------|--------|----------|-----------|
| SS-1 | Reconciliar modelo de roles (owner-only) | P0 | ✅ Hecho | S | — |
| SS-2 | RPC de movimiento de stock (fix sobreventa) | P0 | ✅ Hecho | M | — |
| SS-3 | Restringir SELECT de `business_subscriptions` | P0 | ✅ Hecho | S | — |
| SS-4 | Aplicar migraciones + verificar checkout E2E | P0 | 🔲 Abierto | S | DB en vivo |
| SS-5 | RPC `get_public_storefront` (fix fuga settings/pagos) | P1 | 🔲 Abierto | L | SS-4 |
| SS-6 | Auth + propiedad + Zod en rutas de escritura | P1 | 🔲 Abierto | L | SS-1 |
| SS-7 | Validación de `/api/upload` + políticas de Storage | P1 | 🔲 Abierto | M | — |
| SS-8 | Regenerar tipos de Supabase (quitar casts) | P1 | 🔲 Abierto | S | SS-4 |
| SS-9 | KPIs reales en el dashboard de admin | P2 | 🔲 Abierto | M | — |
| SS-10 | Agregación de stock en SQL (rendimiento) | P2 | 🔲 Abierto | S | — |
| SS-11 | Rol staff: RLS + backend de invitación + alcance por tienda | P2 | 🔲 Abierto | L | SS-6 |
| SS-12 | Consola `saas-admin` (plataforma) | P3 | 🔲 Abierto | L | — |
| SS-13 | Automatización de facturación/renovación | P3 | 🔲 Abierto | L | — |
| SS-14 | Subida de captura de pago en checkout | P3 | 🔲 Abierto | M | — |

---

## P0 — Bloquea el piloto

### SS-4 · Aplicar migraciones y verificar el checkout end-to-end  🔲 Abierto · S
**Depende de:** DB del piloto disponible.
Validar que el fix de sobreventa (SS-2) y el cierre de fuga (SS-3) funcionan en una DB real.
**Tareas**
- Aplicar `20260623120000_stock_movement_rpcs.sql` y `20260623130000_lock_subscriptions_select.sql`.
- Checkout E2E: confirmar que el stock se descuenta y se inserta `inventory_logs` con `reason='sale'`.
- Confirmar idempotencia: reintentar la RPC con el mismo `order_id` no duplica el descuento.
**Criterios de aceptación**
- Una orden de prueba descuenta stock y deja log; un segundo `place_order_stock_movement` no cambia nada.
- Un visitante anónimo ya **no** puede leer `business_subscriptions` de otros negocios.

---

## P1 — Antes de escalar más allá del piloto

### SS-5 · RPC `get_public_storefront` para cerrar la fuga de settings/pagos  🔲 Abierto · L
**Depende de:** SS-4. **Ref:** plan §8 R3b.
RLS no puede acotar lecturas anónimas por tenant; se necesita una RPC `SECURITY DEFINER`.
**Tareas**
- Crear `get_public_storefront(slug)` que devuelva el payload público de **un** tenant
  (settings necesarios + métodos de pago activos), bypass de RLS controlado por la función.
- Recablear `getBusinessBySlug` y `getPaymentMethodsForBusiness` (`lib/api/business.ts`)
  manteniendo **forma de retorno idéntica**.
- Restringir el SELECT de `business_settings` y `business_payment_methods` a owner.
**Criterios de aceptación**
- El storefront público de un tenant muestra correctamente settings y métodos de pago.
- Una consulta anónima directa a esas tablas (anon key) ya **no** devuelve filas de otros negocios.
- Sin regresiones visuales en home/checkout/footer/locations.

### SS-6 · Auth + propiedad + validación Zod en rutas de escritura  🔲 Abierto · L
**Depende de:** SS-1. **Ref:** plan §6 / R4. Patrón: `getUser` → `getBusinessRole(business_id)` → `zod.parse(body)`.
**Rutas a cubrir (checklist)**
- [ ] `POST/PUT /api/products`, `/api/products/[id]`
- [ ] `POST/PUT/DELETE /api/categories`, `/api/categories/[id]`
- [ ] `POST/PUT/DELETE /api/stores`, `/api/stores/[id]`
- [ ] `POST/PUT/DELETE /api/payment-methods`, `/api/payment-methods/[id]`
- [ ] `PUT /api/businesses/settings`
- [ ] `PUT /api/orders/[id]` (cambio de estado)
- [ ] `POST /api/admin/subscriptions/change` — **cerrar el chequeo de auth pendiente** (hoy tiene un "NOTE" sin terminar).
- [ ] `POST /api/inventory/adjust` — la RPC ya valida dueño; añadir Zod de entrada.
**Criterios de aceptación**
- Toda ruta de escritura rechaza (401/403) a quien no es dueño del `business_id` afectado.
- Todo body inválido recibe 400 con detalle de Zod; no hay `as` sin validar.
- Cobertura defensa-en-profundidad incluso si RLS fallara.

### SS-7 · Validación de `/api/upload` y políticas de Storage  🔲 Abierto · M
**Ref:** plan §6.
**Tareas**
- Allowlist de tipo MIME y límite de tamaño; rechazar lo demás con 400.
- Reemplazar nombres `Math.random()` por `crypto.randomUUID()`.
- Requerir sesión autenticada para subir.
- Versionar en una migración las políticas RLS de los buckets (hoy no están en el repo).
**Criterios de aceptación**
- Subida de un `.exe`/archivo grande → 400. Subida válida autenticada → 200.
- Las políticas de bucket existen en `supabase/migrations` y restringen escritura a dueños.

### SS-8 · Regenerar tipos de Supabase y quitar casts `unknown`  🔲 Abierto · S
**Depende de:** SS-4 (migraciones aplicadas).
**Tareas**
- `supabase gen types` para incluir `place_order_stock_movement` y `adjust_store_stock`.
- Quitar los casts `unknown` de `api/orders/route.ts` y `api/inventory/adjust/route.ts`.
**Criterios de aceptación**
- `pnpm tsc` limpio sin casts en las llamadas RPC.

---

## P2 — Completitud / pulido

### SS-9 · KPIs reales en el dashboard de admin  🔲 Abierto · M
`admin/(dashboard)/page.tsx` muestra datos mock (ventas, clientes, ingresos, sparklines).
**Criterios de aceptación**
- KPIs calculados desde `business_orders`/`business_order_items` del negocio activo.
- Sin datos fabricados en la vista.

### SS-10 · Agregación de stock en SQL  🔲 Abierto · S
`products/route.ts` suma `store_inventory` en JS. Mover a agregación SQL.
(El N+1 del checkout ya quedó resuelto por SS-2.)
**Criterios de aceptación**
- El listado de productos no trae filas de inventario para sumar en JS.

### SS-11 · Rol staff: RLS, backend de invitación y alcance por tienda  🔲 Abierto · L
**Depende de:** SS-6. Diferido del piloto (decisión owner-only).
**Tareas**
- `check_has_business_access(business_id)` (owner **o** staff) y repuntar las políticas
  que el staff debe alcanzar (`business_products`, `store_inventory`, `business_categories`,
  `business_orders` UPDATE).
- Backend real de invitación (hoy `settings/users/new` es mock sobre Zustand).
- Restaurar la opción "Editor" en la UI y decidir alcance por tienda (`assigned_store_id`).
**Criterios de aceptación**
- Un staff invitado puede gestionar productos/inventario/pedidos pero no facturación,
  borrar tiendas ni invitar usuarios.

---

## P3 — Fuera del alcance del piloto

### SS-12 · Consola `saas-admin` (plataforma)  🔲 Abierto · L
`apps/saas-admin` es un scaffold vacío de Vite. Definir alcance (gestión de planes, negocios,
métricas globales) antes de construir.

### SS-13 · Automatización de facturación/renovación de suscripciones  🔲 Abierto · L
Hoy el cambio de plan es manual (`/api/admin/subscriptions/change`). Falta renovación, cobro
y estados de ciclo.

### SS-14 · Subida de captura de pago en checkout  🔲 Abierto · M
`CheckoutForm.tsx` tiene el campo deshabilitado ("Próximamente"). Habilitar subida y asociar
el comprobante a la orden.
