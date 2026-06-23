'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { useAdminStore } from '@/stores/adminStore';

// Piloto: solo se admite el rol Administrador (owner). El rol de staff/Editor queda
// diferido hasta que exista un backend real de invitación y RLS de acceso staff.
const userRoleSchema = z.enum(['Admin']);

const userSchema = z.object({
  name: z.string().min(2, 'El nombre completo es requerido'),
  email: z.string().email('Correo electrónico inválido'),
  role: userRoleSchema,
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres'),
});

type UserFormValues = z.infer<typeof userSchema>;

export default function CreateUserPage() {
  const router = useRouter();
  const { addProfile, activeBusiness, activeStore } = useAdminStore();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<UserFormValues>({
    resolver: zodResolver(userSchema),
    defaultValues: {
      name: '',
      email: '',
      role: 'Admin',
      password: '',
    },
  });

  const onSubmit = async (data: UserFormValues) => {
    await new Promise((resolve) => setTimeout(resolve, 600)); // Simulate API call
    addProfile({
      business_id: activeBusiness?.id || null,
      full_name: data.name,
      role: data.role === 'Admin' ? 'owner' : 'administrative',
      assigned_store_id: data.role === 'Admin' ? null : (activeStore?.id || null),
    });
    router.push('/admin/settings');
  };

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div>
        <Link
          href="/admin/settings"
          className="inline-flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-zinc-500 hover:text-black transition-colors mb-4"
        >
          <ArrowLeft className="w-4 h-4" /> Volver a Configuración
        </Link>
        <h1 className="text-3xl font-bold tracking-tight">Nuevo Usuario</h1>
        <p className="text-zinc-500 mt-2">Crea un nuevo usuario para otorgarle acceso al portal administrativo</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-8 bg-white border border-zinc-200 p-6 md:p-8">
        
        <div className="space-y-6">
          <div className="space-y-2">
            <label htmlFor="name" className="block text-sm font-bold uppercase tracking-widest text-zinc-800">
              Nombre Completo
            </label>
            <input
              id="name"
              type="text"
              {...register('name')}
              className={`w-full h-11 px-4 border ${errors.name ? 'border-red-500' : 'border-zinc-200'} focus:outline-none focus:border-black transition-colors rounded-none`}
              placeholder="Ej. Juan Pérez"
            />
            {errors.name && <p className="text-red-500 text-xs font-semibold">{errors.name.message}</p>}
          </div>

          <div className="space-y-2">
            <label htmlFor="email" className="block text-sm font-bold uppercase tracking-widest text-zinc-800">
              Correo Electrónico
            </label>
            <input
              id="email"
              type="email"
              {...register('email')}
              className={`w-full h-11 px-4 border ${errors.email ? 'border-red-500' : 'border-zinc-200'} focus:outline-none focus:border-black transition-colors rounded-none`}
              placeholder="Ej. juan@megaimport.com"
            />
            {errors.email && <p className="text-red-500 text-xs font-semibold">{errors.email.message}</p>}
          </div>

          <div className="space-y-2">
            <label htmlFor="role" className="block text-sm font-bold uppercase tracking-widest text-zinc-800">
              Rol
            </label>
            <div className="relative">
              <select
                id="role"
                {...register('role')}
                className={`w-full h-11 px-4 border ${errors.role ? 'border-red-500' : 'border-zinc-200'} focus:outline-none focus:border-black transition-colors rounded-none appearance-none bg-white`}
              >
                <option value="Admin">Administrador (Acceso Total)</option>
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-zinc-500">
                <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
              </div>
            </div>
            {errors.role && <p className="text-red-500 text-xs font-semibold">{errors.role.message}</p>}
          </div>

          <div className="space-y-2">
            <label htmlFor="password" className="block text-sm font-bold uppercase tracking-widest text-zinc-800">
              Contraseña
            </label>
            <input
              id="password"
              type="password"
              {...register('password')}
              className={`w-full h-11 px-4 border ${errors.password ? 'border-red-500' : 'border-zinc-200'} focus:outline-none focus:border-black transition-colors rounded-none`}
              placeholder="••••••••"
            />
            {errors.password && <p className="text-red-500 text-xs font-semibold">{errors.password.message}</p>}
          </div>
        </div>

        {/* Actions */}
        <div className="pt-6 border-t border-zinc-200 flex gap-4 justify-end">
          <Link
            href="/admin/settings"
            className="px-8 py-3 text-sm font-bold uppercase tracking-widest border border-zinc-200 text-zinc-600 hover:bg-zinc-50 hover:text-black transition-colors"
          >
            Cancelar
          </Link>
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-8 py-3 text-sm font-bold uppercase tracking-widest bg-black text-white hover:bg-zinc-800 transition-colors disabled:opacity-50"
          >
            {isSubmitting ? 'Guardando...' : 'Crear Usuario'}
          </button>
        </div>
      </form>
    </div>
  );
}
