import { createContext, type ReactNode } from 'react';

/** Extra buttons the app puts into every top bar (e.g. search, F8 §3.1). */
export const TopBarExtraContext = createContext<ReactNode>(null);
