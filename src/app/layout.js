import "./globals.css";
import { AuthProvider } from "@/lib/AuthContext";
import Navbar from "@/components/Navbar";

export const metadata = {
  title: "Gestión Ambiental de Residuos Industriales",
  description:
    "Herramienta para verificar qué normativa ambiental (nacional, provincial y municipal) le aplica a tu empresa, y generar el checklist de trámites correspondiente.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="es" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-white text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
        <AuthProvider>
          <Navbar />
          <main className="flex-1">{children}</main>
        </AuthProvider>
      </body>
    </html>
  );
}
