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

## Cómo dar de alta un usuario admin

**Opción rápida (recomendada):** en `/login`, pestaña "Crear cuenta" → elegís
el tipo de cuenta **"Equipo del proyecto"** en vez de "Empresa". Te pide un
código (variable `NEXT_PUBLIC_ADMIN_SIGNUP_CODE`, ver `.env.local.example`)
y te crea la cuenta directo con rol admin, sin pasar por el wizard de alta
de establecimiento. Cambiá ese código antes de compartir el link con nadie
más.

**Opción manual (si ya te registraste como empresa):**

1. En la consola de Firebase → Firestore Database → colección `usuarios` →
   buscá el documento con tu `uid` (mismo id que en Authentication → Users).
2. Editá el campo `role` de `"cliente"` a `"admin"`.
3. Refrescá la sesión (cerrá sesión y volvé a entrar) — ahora vas a ver el
   panel de administración en `/admin`.

> Nota de seguridad: el código de admin viaja en el bundle del cliente
> (`NEXT_PUBLIC_...`), así que no es un secreto fuerte — alcanza para este
> piloto con pocos usuarios conocidos, pero no lo uses como único control de
> acceso en un despliegue más grande.

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

## Escalabilidad a otras industrias y zonas

El modelo ya soporta más de un rubro y más de un municipio al mismo tiempo.
Además de industria química / Tigre, hay un segundo caso cargado como
prueba de escalabilidad: **curtiembres en la Cuenca Matanza-Riachuelo
(Lanús)**, que suma:

- Una jurisdicción interjurisdiccional (`acumar`) que se superpone a un
  municipio (marcada con el campo `cuenca_ref` en el documento del
  municipio en `jurisdicciones`).
- Trámites propios de ACUMAR (inscripción como agente contaminante,
  Programa de Reconversión Industrial, cámara de toma de muestra, control
  de parámetros de vertido) además de los provinciales/nacionales que ya
  existían.

El motor de matching (`src/lib/matching.js`) filtra los trámites por
**tema ambiental Y jurisdicción**: un trámite municipal de Tigre nunca le
va a aparecer a una empresa de Lanús, y viceversa, aunque compartan el
mismo tema. La función `jurisdiccionesAplicables()` arma la lista de
jurisdicciones válidas para un establecimiento (nación + su provincia + su
municipio + la autoridad de cuenca, si corresponde) antes de armar el
checklist.

Para sumar una industria o zona nueva: agregar el documento en
`industrias` o `jurisdicciones` (vía `seed-normativa.html`), cargar sus
normativas y trámites con el `jurisdiccion_ref`/`tema_ref` que corresponda,
y ya aparece como opción en el wizard de onboarding — no hace falta tocar
código.

## Flujo de la app

1. **Landing (`/`)** → explica la herramienta, botones de registro/login.
2. **Registro/login (`/login`)** → crea el usuario en Firebase Auth + un doc
   en `usuarios` con `role: "cliente"`.
3. **Onboarding (`/onboarding`)** → wizard de 3 pasos: rubro y municipio,
   datos del establecimiento, y las respuestas ambientales (genera residuos
   peligrosos, especiales, efluentes, emisiones, habilitación). Al
   confirmar, se generan automáticamente los documentos de `cumplimiento`
   cruzando esas respuestas contra `tramites` — filtrados por tema
   ambiental y por jurisdicción.
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
