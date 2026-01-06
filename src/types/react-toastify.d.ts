// Stub type declarations for react-toastify
declare module "react-toastify" {
  export interface ToastOptions {
    position?: string;
    autoClose?: number | false;
    hideProgressBar?: boolean;
    closeOnClick?: boolean;
    pauseOnHover?: boolean;
    draggable?: boolean;
    type?: 'info' | 'success' | 'warning' | 'error' | 'default';
    theme?: 'light' | 'dark' | 'colored';
  }

  export const toast: {
    (message: string, options?: ToastOptions): void;
    success(message: string, options?: ToastOptions): void;
    error(message: string, options?: ToastOptions): void;
    info(message: string, options?: ToastOptions): void;
    warning(message: string, options?: ToastOptions): void;
    dismiss(toastId?: string | number): void;
  };

  export const ToastContainer: React.ComponentType<any>;
}
