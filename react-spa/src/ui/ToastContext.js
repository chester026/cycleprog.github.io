import { createContext } from 'react';

// Split into its own file so both `ToastProvider` and `useToast` can import
// the context without either module needing to import the other.
const ToastContext = createContext(null);

export default ToastContext;
