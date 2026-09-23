# Normativa Ambiental — Tigre (Industria Química)

Herramienta piloto para verificar qué normativa ambiental (nacional,
provincial de Buenos Aires y municipal de Tigre) le aplica a una empresa
química, y generar automáticamente su checklist de trámites.

Desarrollado como parte del TFG de Camila (UCES) — pensado para escalar
después a otros municipios y rubros industriales.

## Stack

- Next.js (App Router) + Tailwind CSS
- Firebase Auth (email/password)
- Firestore (base de datos)

## Estructura del modelo de datos

- `jurisdicciones`, `industrias`, `temas_ambientales`, `normativas`, `tramites`
  → base normativa (ya cargada vía el seed).
- `usuarios` → `{ email, role: "admin"|"cliente", establecimiento_ref }`
- `establecimientos` → ficha de cada empresa cargada por el wizard de onboarding.
- `cumplimiento` → el cruce (checklist) entre un establecimiento y los
  trámites que le aplican, generado automáticamente por
  `src/lib/matching.js` a partir de las respuestas del onboarding.

## Cómo correr en local

```bash
npm install
cp .env.local.example .env.local   # ya viene con la config del proyecto gestion-96165
npm run dev
```

## Firestore — reglas de seguridad

El archivo `firestore.rules` en la raíz tiene las reglas reales (lectura
pública de la normativa, escritura solo del dueño de cada establecimiento,
y acceso total para el rol admin). Pegalas en la consola de Firebase:

**Firestore Database → Reglas** → pegar el contenido de `firestore.rules` → Publicar.

> Nota: mientras se cargó la base con el archivo de seed (`seed-normativa.html`)
> se usaron reglas abiertas (`allow read, write: if true`) temporalmente. No
> te olvides de reemplazarlas por las de `firestore.rules` antes de dejar la
> app en producción.

## Cómo dar de alta al primer usuario admin

1. Registrate normalmente desde `/login?modo=registro` con el email que vas
   a usar como admin.
2. En la consola de Firebase → Firestore Database → colección `usuarios` →
   buscá el documento con tu `uid` (mismo id que en Authentication → Users).
3. Editá el campo `role` de `"cliente"` a `"admin"`.
4. Refrescá la sesión (cerrá sesión y volvé a entrar) — ahora vas a ver el
   panel de administración en `/admin`.

## Deploy

### 1. Subir a GitHub

```bash
git add -A
git commit -m "App piloto de normativa ambiental — Tigre / industria química"
git branch -M main
git remote add origin <URL_DEL_REPO_VACIO_EN_GITHUB>
git push -u origin main
```

### 2. Deploy en Vercel

1. Entrá a [vercel.com](https://vercel.com) → **Add New → Project** → importá
   el repo de GitHub que acabás de crear.
2. En **Environment Variables**, cargá las mismas 6 variables de
   `.env.local.example` (todas empiezan con `NEXT_PUBLIC_FIREBASE_...`).
3. Deploy. Vercel detecta Next.js automáticamente, no hace falta tocar nada
   más.
4. En Firebase → Authentication → Settings → **Authorized domains**, agregá
   el dominio que te da Vercel (`tu-proyecto.vercel.app`) para que el login
   funcione ahí también.

## Flujo de la app

1. **Landing (`/`)** → explica la herramienta, botones de registro/login.
2. **Registro/login (`/login`)** → crea el usuario en Firebase Auth + un doc
   en `usuarios` con `role: "cliente"`.
3. **Onboarding (`/onboarding`)** → wizard de 3 pasos que carga los datos del
   establecimiento y las respuestas ambientales (genera residuos peligrosos,
   especiales, efluentes, emisiones, habilitación). Al confirmar, se generan
   automáticamente los documentos de `cumplimiento` cruzando esas respuestas
   contra `tramites`.
4. **Dashboard cliente (`/dashboard`)** → checklist editable (estado y fecha
   de vencimiento de cada trámite).
5. **Dashboard admin (`/admin`)** → listado de todas las empresas cargadas,
   métricas agregadas y detalle de cada una (`/admin/establecimientos/[id]`).

## Próximos pasos sugeridos

- Permitir editar los datos del establecimiento después del onboarding
  inicial (hoy solo se genera una vez).
- Sumar más rubros a `industrias` y más municipios a `jurisdicciones` para
  probar la escalabilidad del modelo.
- Exportar el checklist a PDF/Excel para adjuntar a la tesis como caso de
  uso real.
