'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Loader2, 
  Clock, 
  Package, 
  CheckCircle2, 
  XCircle, 
  ChevronRight,
  User,
  Phone,
  MapPin,
  CreditCard,
  Hash,
  X,
  GripVertical,
  AlertCircle
} from 'lucide-react';
import { ActionModal } from '@/components/ui/ActionModal';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { getBusinessBySlug } from '@/lib/api/inventory-client';
import useEventListener from '@/lib/hooks/useEventListener';
import { cn } from '@/lib/utils';
import Image from 'next/image';

interface OrderItem {
  id: string;
  quantity: number;
  unit_price: number;
  business_products: {
    name: string;
    image_url: string | null;
  };
}

interface Order {
  id: string;
  customer_name: string;
  customer_id_number: string;
  customer_phone: string;
  customer_address: string;
  total_amount: number;
  payment_reference: string;
  status: 'new' | 'preparing' | 'shipped' | 'delivered' | 'cancelled';
  created_at: string;
  business_order_items: OrderItem[];
}

export default function AdminOrdersPage() {
  const { tenant } = useParams();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  // Drag and Drop State
  const [draggedOrder, setDraggedOrder] = useState<Order | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);

  const columns = [
    { id: 'new', title: 'Nuevos', icon: Clock, color: 'text-blue-600', bg: 'bg-blue-50' },
    { id: 'preparing', title: 'Preparando', icon: Package, color: 'text-amber-600', bg: 'bg-amber-50' },
    { id: 'delivered', title: 'Entregados', icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50' },
  ];

  const loadOrders = useCallback(async () => {
    try {
      const business = await getBusinessBySlug(tenant as string);
      if (business) {
        const res = await fetch(`/api/orders?business_id=${business.id}`);
        if (res.ok) {
          const data = await res.json();
          setOrders(data);
        }
      }
    } catch (error) {
      toast.error('Error al cargar pedidos');
    } finally {
      setLoading(false);
    }
  }, [tenant]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  const updateOrderStatus = async (orderId: string, status: string) => {
    setIsUpdating(true);
    // Optimistic UI update
    const previousOrders = [...orders];
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: status as any } : o));

    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });

      if (res.ok) {
        toast.success(`Pedido ${status === 'preparing' ? 'en preparación' : status === 'cancelled' ? 'cancelado' : 'actualizado'}`, {
          className: "bg-black text-white rounded-none border border-zinc-800 font-bold uppercase tracking-widest text-[10px]"
        });
        // Reload to sync with server
        loadOrders();
        if (selectedOrder?.id === orderId) {
          setSelectedOrder(prev => prev ? { ...prev, status: status as any } : null);
        }
        if (status === 'cancelled') {
          setIsCancelModalOpen(false);
        }
      } else {
        throw new Error('Failed to update');
      }
    } catch (error) {
      setOrders(previousOrders); // Rollback
      toast.error('Error al actualizar estado');
    } finally {
      setIsUpdating(false);
    }
  };

  // Drag and Drop Event Handlers using useEventListener
  useEventListener('dragover', (e: any) => {
    const column = e.target.closest('[data-column-id]');
    if (column) {
      e.preventDefault(); // Required to allow drop
      const colId = column.getAttribute('data-column-id');
      setDragOverColumn(colId);
    } else {
      setDragOverColumn(null);
    }
  });

  useEventListener('drop', (e: any) => {
    const column = e.target.closest('[data-column-id]');
    if (column && draggedOrder) {
      const newStatus = column.getAttribute('data-column-id');
      
      if (newStatus && newStatus !== draggedOrder.status) {
        updateOrderStatus(draggedOrder.id, newStatus);
      }
    }
    setDragOverColumn(null);
    setDraggedOrder(null);
  });

  if (loading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-zinc-400 gap-4">
        <Loader2 className="w-8 h-8 animate-spin text-black" />
        <p className="text-[10px] font-bold uppercase tracking-[0.2em]">Cargando Pedidos...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 flex flex-col h-full pb-10">
      <div>
        <h1 className="text-3xl font-bold tracking-tight uppercase">Pedidos</h1>
        <p className="text-zinc-500 mt-2 font-medium tracking-wide">Gestión de flujo de órdenes y ventas</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 flex-1 items-start h-[calc(100vh-16rem)] min-h-[500px]">
        {columns.map((col) => {
          const colOrders = orders.filter(o => {
            if (col.id === 'delivered') return o.status === 'delivered' || o.status === 'shipped';
            return o.status === col.id;
          });

          const isOver = dragOverColumn === col.id;

          return (
            <div 
              key={col.id} 
              data-column-id={col.id}
              className={cn(
                "flex flex-col border h-full overflow-hidden transition-colors duration-200",
                isOver ? "bg-zinc-100 border-black ring-2 ring-black/5" : "bg-zinc-50 border-zinc-200"
              )}
            >
              <div className="p-5 border-b border-zinc-200 bg-white flex justify-between items-center shrink-0">
                <div className="flex items-center gap-3">
                  <col.icon size={16} className={col.color} />
                  <h2 className="text-xs font-black uppercase tracking-[0.2em]">{col.title}</h2>
                </div>
                <span className="text-[10px] font-black bg-zinc-100 px-2 py-1 rounded-sm text-zinc-500 min-w-[24px] text-center">
                  {colOrders.length}
                </span>
              </div>
              
              <div className="p-4 space-y-4 flex-1 overflow-y-auto">
                <AnimatePresence mode="popLayout">
                  {colOrders.map(order => (
                    <motion.div 
                      key={order.id}
                      layout
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      draggable="true"
                      onDragStart={() => setDraggedOrder(order)}
                      onDragEnd={() => {
                        setDraggedOrder(null);
                        setDragOverColumn(null);
                      }}
                      onClick={() => setSelectedOrder(order)}
                      className={cn(
                        "group border bg-white p-5 hover:border-black cursor-grab active:cursor-grabbing transition-all shadow-sm active:scale-[0.98] relative",
                        draggedOrder?.id === order.id ? "opacity-40 grayscale border-dashed border-zinc-400" : "border-zinc-200"
                      )}
                    >
                      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <GripVertical size={14} className="text-zinc-300" />
                      </div>
                      <div className="flex justify-between items-start mb-3">
                        <span className="font-black text-[10px] uppercase tracking-widest text-zinc-400 group-hover:text-black transition-colors">
                          #{order.id.slice(0, 8)}
                        </span>
                        <span className="font-black text-sm tracking-tighter">
                          ${Number(order.total_amount).toFixed(2)}
                        </span>
                      </div>
                      
                      <h3 className="font-bold text-sm uppercase tracking-tight mb-4 truncate">
                        {order.customer_name}
                      </h3>

                      <div className="flex justify-between items-center">
                        <div className="flex -space-x-2">
                          {order.business_order_items.slice(0, 3).map((item, i) => (
                            <div key={i} className="w-7 h-7 rounded-full border-2 border-white bg-zinc-100 overflow-hidden relative shadow-sm">
                              {item.business_products.image_url ? (
                                <Image 
                                  src={item.business_products.image_url} 
                                  alt={item.business_products.name}
                                  fill
                                  className="object-cover"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-[8px] font-bold">
                                  {item.business_products.name[0]}
                                </div>
                              )}
                            </div>
                          ))}
                          {order.business_order_items.length > 3 && (
                            <div className="w-7 h-7 rounded-full border-2 border-white bg-zinc-800 text-white flex items-center justify-center text-[8px] font-black shadow-sm">
                              +{order.business_order_items.length - 3}
                            </div>
                          )}
                        </div>
                        
                        <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 group-hover:text-black flex items-center gap-1">
                          Detalles <ChevronRight size={12} />
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
                
                {colOrders.length === 0 && (
                  <div className="text-center text-zinc-400 text-[10px] font-bold uppercase tracking-widest py-12 border-2 border-dashed border-zinc-200">
                    Sin pedidos
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Order Detail Modal */}
      <AnimatePresence>
        {selectedOrder && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedOrder(null)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            
            <motion.div
              initial={{ scale: 0.95, opacity: 0, x: 20 }}
              animate={{ scale: 1, opacity: 1, x: 0 }}
              exit={{ scale: 0.95, opacity: 0, x: 20 }}
              className="relative bg-white w-full max-w-4xl h-[90vh] overflow-hidden shadow-2xl flex flex-col"
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between p-6 border-b border-zinc-100 bg-zinc-50 shrink-0">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-black text-white flex items-center justify-center font-black rounded-lg">
                    {selectedOrder.status === 'new' ? <Clock /> : selectedOrder.status === 'preparing' ? <Package /> : <CheckCircle2 />}
                  </div>
                  <div>
                    <h2 className="text-lg font-black uppercase tracking-widest leading-tight">
                      Pedido #{selectedOrder.id.slice(0, 8)}
                    </h2>
                    <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mt-0.5">
                      {format(new Date(selectedOrder.created_at), "eeee d 'de' MMMM, yyyy - HH:mm", { locale: es })}
                    </p>
                  </div>
                </div>
                <button onClick={() => setSelectedOrder(null)} className="p-2 hover:bg-zinc-200 transition-colors">
                  <X size={24} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-8 grid grid-cols-1 md:grid-cols-12 gap-10">
                {/* Left: Customer & Items */}
                <div className="md:col-span-7 space-y-10">
                  <section className="space-y-6">
                    <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400 border-b border-zinc-100 pb-2">
                      Información del Cliente
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                      <div className="space-y-1">
                        <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-2">
                          <User size={12} /> Cliente
                        </p>
                        <p className="font-black text-sm uppercase">{selectedOrder.customer_name}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-2">
                          <Hash size={12} /> Cédula
                        </p>
                        <p className="font-black text-sm uppercase">{selectedOrder.customer_id_number}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-2">
                          <Phone size={12} /> Teléfono
                        </p>
                        <p className="font-black text-sm">{selectedOrder.customer_phone}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-2">
                          <MapPin size={12} /> Dirección
                        </p>
                        <p className="font-bold text-xs text-zinc-600 leading-relaxed">{selectedOrder.customer_address}</p>
                      </div>
                    </div>
                  </section>

                  <section className="space-y-6">
                    <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400 border-b border-zinc-100 pb-2">
                      Artículos ({selectedOrder.business_order_items.length})
                    </h3>
                    <div className="space-y-4">
                      {selectedOrder.business_order_items.map((item) => (
                        <div key={item.id} className="flex gap-4 p-3 border border-zinc-100 hover:bg-zinc-50 transition-colors">
                          <div className="w-16 h-16 bg-zinc-100 shrink-0 border border-zinc-200 overflow-hidden relative">
                            {item.business_products.image_url ? (
                              <Image 
                                src={item.business_products.image_url} 
                                alt={item.business_products.name}
                                fill
                                className="object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-zinc-300"><Package /></div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0 flex flex-col justify-center">
                            <h4 className="font-black text-xs uppercase tracking-tight truncate">{item.business_products.name}</h4>
                            <div className="flex justify-between items-center mt-2">
                              <span className="text-[10px] font-bold text-zinc-400 uppercase">
                                {item.quantity} x ${Number(item.unit_price).toFixed(2)}
                              </span>
                              <span className="font-black text-xs">
                                ${(item.quantity * item.unit_price).toFixed(2)}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                </div>

                {/* Right: Payment & Status Actions */}
                <div className="md:col-span-5 space-y-10">
                  <section className="space-y-6">
                    <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400 border-b border-zinc-100 pb-2">
                      Pago y Totales
                    </h3>
                    <div className="bg-zinc-900 text-white p-6 space-y-6 rounded-sm">
                      <div className="flex justify-between items-start">
                        <div className="space-y-1">
                          <p className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.2em]">Referencia</p>
                          <p className="text-xl font-black tracking-widest">{selectedOrder.payment_reference}</p>
                        </div>
                        <CreditCard className="text-zinc-700" size={24} />
                      </div>
                      
                      <div className="pt-4 border-t border-zinc-800 space-y-2">
                        <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                          <span>Subtotal</span>
                          <span>${Number(selectedOrder.total_amount).toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest text-emerald-500">
                          <span>Envío</span>
                          <span>Gratis</span>
                        </div>
                        <div className="flex justify-between items-center pt-2">
                          <span className="text-xs font-black uppercase tracking-[0.2em]">Total Final</span>
                          <span className="text-2xl font-black">${Number(selectedOrder.total_amount).toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                  </section>

                  <section className="space-y-6">
                    <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400 border-b border-zinc-100 pb-2">
                      Acciones de Estado
                    </h3>
                    <div className="grid grid-cols-1 gap-3">
                      {selectedOrder.status === 'new' && (
                        <button 
                          onClick={() => updateOrderStatus(selectedOrder.id, 'preparing')}
                          className="w-full h-14 bg-black text-white font-black uppercase tracking-[0.2em] text-[10px] hover:bg-zinc-800 transition-all flex items-center justify-center gap-3 shadow-lg"
                        >
                          <Package size={18} />
                          Comenzar Preparación
                        </button>
                      )}
                      
                      {selectedOrder.status === 'preparing' && (
                        <button 
                          onClick={() => updateOrderStatus(selectedOrder.id, 'delivered')}
                          className="w-full h-14 bg-emerald-600 text-white font-black uppercase tracking-[0.2em] text-[10px] hover:bg-emerald-700 transition-all flex items-center justify-center gap-3 shadow-lg"
                        >
                          <CheckCircle2 size={18} />
                          Marcar como Entregado
                        </button>
                      )}

                      {(selectedOrder.status === 'new' || selectedOrder.status === 'preparing') && (
                        <button 
                          onClick={() => setIsCancelModalOpen(true)}
                          className="w-full h-14 border-2 border-zinc-200 text-zinc-400 font-black uppercase tracking-[0.2em] text-[10px] hover:text-red-600 hover:border-red-600 transition-all flex items-center justify-center gap-3"
                        >
                          <XCircle size={18} />
                          Cancelar Pedido
                        </button>
                      )}

                      {selectedOrder.status === 'delivered' && (
                        <div className="bg-emerald-50 border border-emerald-100 p-6 text-center space-y-2">
                          <CheckCircle2 size={32} className="mx-auto text-emerald-600" />
                          <p className="text-[10px] font-black uppercase tracking-widest text-emerald-700">Este pedido ha sido completado</p>
                        </div>
                      )}

                      {selectedOrder.status === 'cancelled' && (
                        <div className="bg-red-50 border border-red-100 p-6 text-center space-y-2">
                          <XCircle size={32} className="mx-auto text-red-600" />
                          <p className="text-[10px] font-black uppercase tracking-widest text-red-700">Este pedido fue cancelado</p>
                        </div>
                      )}
                    </div>
                  </section>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="p-6 border-t border-zinc-100 bg-zinc-50 flex justify-between items-center shrink-0">
                <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-zinc-400">
                  <Clock size={12} />
                  Última actualización: {format(new Date(selectedOrder.created_at), "HH:mm")}
                </div>
                <button 
                  onClick={() => setSelectedOrder(null)}
                  className="px-8 py-3 bg-zinc-200 text-zinc-600 font-black uppercase tracking-widest text-[10px] hover:bg-black hover:text-white transition-all"
                >
                  Cerrar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <ActionModal
        isOpen={isCancelModalOpen}
        onClose={() => setIsCancelModalOpen(false)}
        onConfirm={() => updateOrderStatus(selectedOrder!.id, 'cancelled')}
        variant="danger"
        title="¿Cancelar Pedido?"
        description="Esta acción marcará el pedido como cancelado y no podrá ser procesado nuevamente en el flujo normal."
        confirmLabel="Si, Cancelar Pedido"
        cancelLabel="No, Regresar"
        isLoading={isUpdating}
        icon={<AlertCircle size={48} />}
      />
    </div>
  );
}
