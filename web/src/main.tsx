import React from "react";
import ReactDOM from "react-dom/client";
import { Alert, Badge, Button, MantineProvider, Paper, createTheme } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router";
import { AuthProvider } from "./app/AuthProvider";
import { App } from "./app/App";
import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import "./styles.css";

const theme = createTheme({
  primaryColor: "blue",
  primaryShade: 8,
  black: "#202b3b",
  colors: { gray: ["#f8f9fa", "#f1f3f5", "#e9ecef", "#dee2e6", "#ced4da", "#adb5bd", "#647180", "#495564", "#343e4c", "#202b3b"] },
  fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
  defaultRadius: "sm",
  radius: { xs: "3px", sm: "6px", md: "8px", lg: "8px", xl: "12px" },
  headings: { fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif", fontWeight: "600" },
  components: {
    Paper: Paper.extend({ defaultProps: { shadow: "none" } }),
    Button: Button.extend({ defaultProps: { fw: 600 } }),
    Badge: Badge.extend({ defaultProps: { radius: "sm", tt: "none", fw: 600 } }),
    Alert: Alert.extend({ defaultProps: { radius: "sm" } }),
  },
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 30_000 },
    mutations: { retry: false },
  },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <MantineProvider theme={theme} defaultColorScheme="light">
      <Notifications position="top-right" />
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AuthProvider>
            <App />
          </AuthProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </MantineProvider>
  </React.StrictMode>,
);
