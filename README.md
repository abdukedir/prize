# Game Prize Management SaaS

Production-ready multi-tenant game prize management app built with Next.js App Router, TypeScript, Tailwind CSS, Prisma, PostgreSQL, JWT cookies, Zod validation, and RBAC.

## Run locally

1. Copy `.env.example` to `.env` and update `DATABASE_URL` and `JWT_SECRET`.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start PostgreSQL.

   With Docker Desktop installed:

   ```bash
   docker compose up -d postgres
   ```

   Or start a local PostgreSQL server yourself and set `DATABASE_URL` in `.env` to match it.

4. Create database tables:
   ```bash
   npx prisma migrate dev
   ```
5. Start the app:
   ```bash
   npm run dev
   ```
6. Open `http://localhost:3000`. If no admin exists, the setup screen creates the first SaaS organization and admin.

Optional demo seed:
```bash
npm run seed
```

Demo credentials after seeding:
- Admin: `admin@demo.com` / `Password123!`
- Employee: `employee@demo.com` / `Password123!`

## Architecture

- SaaS tenancy is represented by `Tenant`; employees, participants, rounds, winners, settings, and logs are scoped by `tenantId`.
- JWT is stored in an HTTP-only cookie.
- API handlers enforce RBAC through shared auth helpers.
- Prisma protects SQL access through parameterized queries.
- Mutating API requests validate CSRF with a double-submit token.
- Reports can be exported as CSV, Excel-compatible TSV, and browser-printable PDF HTML.

## Deployment

1. Provision PostgreSQL.
2. Set `DATABASE_URL`, `JWT_SECRET`, and `APP_URL` in your host.
3. Run:
   ```bash
   npm install
   npx prisma migrate deploy
   npm run build
   npm run start
   ```

For Vercel, add the same environment variables, then set the build command to `npx prisma generate && next build`.
