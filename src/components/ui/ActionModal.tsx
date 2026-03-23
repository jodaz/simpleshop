'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { X, Loader2, AlertCircle, CheckCircle2, HelpCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ActionModalVariant = 'primary' | 'danger' | 'warning' | 'success';

interface ActionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ActionModalVariant;
  isLoading?: boolean;
  icon?: React.ReactNode;
}

export function ActionModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  variant = 'primary',
  isLoading = false,
  icon
}: ActionModalProps) {
  
  const variants = {
    primary: {
      bg: 'bg-black',
      text: 'text-white',
      hover: 'hover:bg-zinc-800',
      iconBg: 'bg-zinc-100',
      iconText: 'text-black',
      icon: icon || <HelpCircle size={24} />
    },
    danger: {
      bg: 'bg-red-600',
      text: 'text-white',
      hover: 'hover:bg-red-700',
      iconBg: 'bg-red-50',
      iconText: 'text-red-600',
      icon: icon || <AlertCircle size={24} />
    },
    warning: {
      bg: 'bg-amber-500',
      text: 'text-white',
      hover: 'hover:bg-amber-600',
      iconBg: 'bg-amber-50',
      iconText: 'text-amber-600',
      icon: icon || <AlertCircle size={24} />
    },
    success: {
      bg: 'bg-emerald-600',
      text: 'text-white',
      hover: 'hover:bg-emerald-700',
      iconBg: 'bg-emerald-50',
      iconText: 'text-emerald-600',
      icon: icon || <CheckCircle2 size={24} />
    }
  };

  const currentVariant = variants[variant];

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={isLoading ? undefined : onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />
          
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 20 }}
            className="relative bg-white w-full max-w-md overflow-hidden shadow-2xl border border-zinc-200 p-8 rounded-none text-center"
          >
            <button 
              onClick={onClose} 
              disabled={isLoading}
              className="absolute top-4 right-4 p-2 hover:bg-zinc-100 transition-colors disabled:opacity-0"
            >
              <X size={20} />
            </button>

            <div className={cn(
              "w-20 h-20 flex items-center justify-center mx-auto mb-6",
              currentVariant.iconBg,
              currentVariant.iconText
            )}>
              {currentVariant.icon}
            </div>

            <h2 className="text-xl font-black uppercase tracking-tight text-black mb-3">
              {title}
            </h2>
            
            <p className="text-sm text-zinc-500 mb-10 leading-relaxed font-medium">
              {description}
            </p>

            <div className="flex flex-col gap-3">
              <button
                onClick={onConfirm}
                disabled={isLoading}
                className={cn(
                  "w-full h-14 flex items-center justify-center gap-3 font-black uppercase tracking-[0.2em] transition-all",
                  currentVariant.bg,
                  currentVariant.text,
                  currentVariant.hover,
                  "disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
                )}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="animate-spin" size={20} />
                    PROCESANDO
                  </>
                ) : (
                  confirmLabel
                )}
              </button>
              
              <button
                onClick={onClose}
                disabled={isLoading}
                className="w-full h-14 flex items-center justify-center font-black uppercase tracking-[0.2em] border border-zinc-200 text-zinc-400 hover:text-black hover:border-black transition-all disabled:opacity-50 active:scale-95"
              >
                {cancelLabel}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
