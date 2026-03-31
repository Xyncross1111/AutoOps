import { createContext, useContext } from "react";

interface AppSessionValue {
  token: string;
  userEmail: string;
  refreshNonce: number;
  setUserEmail: (value: string) => void;
  refreshApp: () => void;
  logout: () => void;
}

export const AppSessionContext = createContext<AppSessionValue | null>(null);

export function useAppSession() {
  const context = useContext(AppSessionContext);
  if (!context) {
    throw new Error("AppSessionContext is not available");
  }
  return context;
}
