import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { darkTheme, lightTheme, type Theme } from './themes';

const ThemeContext = createContext<Theme>(darkTheme);

export interface ThemeProviderProps {
  children: ReactNode;
  /** Force a scheme (e.g. from a settings screen); omit to follow the OS. */
  scheme?: 'dark' | 'light';
}

export function ThemeProvider({ children, scheme }: ThemeProviderProps) {
  const systemScheme = useColorScheme();
  const resolved = scheme ?? (systemScheme === 'light' ? 'light' : 'dark');
  const theme = useMemo(() => (resolved === 'light' ? lightTheme : darkTheme), [resolved]);
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

/** The one way screens/components read design tokens. */
export function useTheme(): Theme {
  return useContext(ThemeContext);
}
