import { toast, type ToastOptions } from 'react-hot-toast'

const defaultOptions: ToastOptions = {
  duration: 4000,
  style: {
    background: 'var(--c-superficie)',
    color: 'var(--c-texto)',
    border: '1px solid var(--c-borde)',
    borderRadius: '0.75rem',
    padding: '1rem',
    fontSize: '0.875rem',
    boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
  },
}

/** Wrapper para toasts consistentes en toda la app. */
export const t = {
  success: (msg: string, opts?: ToastOptions) => toast.success(msg, { ...defaultOptions, ...opts }),
  error: (msg: string, opts?: ToastOptions) => toast.error(msg, { ...defaultOptions, ...opts }),
  info: (msg: string, opts?: ToastOptions) => toast(msg, { ...defaultOptions, icon: 'ℹ️', ...opts }),
  loading: (msg: string, opts?: ToastOptions) => toast.loading(msg, { ...defaultOptions, ...opts }),
  dismiss: (id: string) => toast.dismiss(id),
  promise: <T,>(
    promise: Promise<T>,
    msgs: { loading: string; success: string | ((data: T) => string); error: string | ((err: unknown) => string) },
    opts?: ToastOptions
  ) => toast.promise(promise, msgs, { ...defaultOptions, ...opts }),
}