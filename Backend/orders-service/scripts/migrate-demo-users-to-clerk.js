#!/usr/bin/env node
'use strict';

// Migra el tenant demo "logify" (id=1) y sus 8 usuarios a Clerk (Fase 2 de
// ADR-004, ver aidlc-docs/design-artifacts/ADR/). Uso de un solo disparo,
// pensado para correrse a mano contra la instancia de PRODUCCION de Clerk.
//
// No escribe en la base de datos directamente: crear la Organization y las
// Organization Memberships en Clerk dispara los mismos eventos de webhook
// (organization.created, organizationMembership.created) que ya sincroniza
// POST /api/webhooks/clerk en orders-service -- ese endpoint ya esta
// desplegado y probado (PR #58), asi que este script delega la escritura en
// Postgres a ese camino ya verificado.
//
// Vive dentro de orders-service/ (no en Backend/scripts/) para poder resolver
// la dependencia @clerk/backend via node_modules de este servicio.
//
// Uso (desde la raiz del repo):
//   cd Backend/orders-service && CLERK_SECRET_KEY=sk_live_... node scripts/migrate-demo-users-to-clerk.js
//
// La secret key NUNCA se hardcodea aca -- se lee del entorno. Correrlo sin
// la variable falla rapido con un mensaje claro, no con un error de Clerk.

const { createClerkClient } = require('@clerk/backend');

const TENANT = { id: 1, slug: 'logify', name: 'Logify' };

// Mismos datos que Backend/orders-service/src/index.js (seedUsers() +
// SECURITY_PROFILES) -- se mantienen las mismas passwords para no romper
// las credenciales que el usuario ya conoce.
const DEMO_USERS = [
  { username: 'admin', password: 'Admin123!', firstName: 'Andrés', lastName: 'Soto', role: 'owner', email: 'andres.soto@logify.cl' },
  { username: 'operaciones', password: 'Ops123!', firstName: 'Marcela', lastName: 'Fuentes', role: 'ops', email: 'marcela.fuentes@logify.cl' },
  { username: 'bodega', password: 'Bodega123!', firstName: 'Patricio', lastName: 'Salazar', role: 'warehouse', email: 'patricio.salazar@logify.cl' },
  { username: 'transportista', password: 'Trans123!', firstName: 'Luis', lastName: 'Carvajal', role: 'shipper', email: 'luis.carvajal@logify.cl' },
  { username: 'vendedor1', password: 'Vend123!', firstName: 'María', lastName: 'González', role: 'vendor', email: 'maria.gonzalez@logify.cl' },
  { username: 'vendedor2', password: 'Vend123!', firstName: 'Carlos', lastName: 'Muñoz', role: 'vendor', email: 'carlos.munoz@logify.cl' },
  { username: 'soporte', password: 'Sop123!', firstName: 'Camila', lastName: 'Torres', role: 'support', email: 'camila.torres@logify.cl' },
  { username: 'cliente', password: 'Cli123!', firstName: 'Rosa', lastName: 'Mardones', role: 'customer', email: 'rosa.mardones@logify.cl' },
];

async function findOrganizationBySlug(clerkClient, slug) {
  try {
    return await clerkClient.organizations.getOrganization({ slug });
  } catch (err) {
    if (err.status === 404) return null;
    throw err;
  }
}

async function findUserByUsername(clerkClient, username) {
  const { data } = await clerkClient.users.getUserList({ username: [username] });
  return data[0] || null;
}

async function ensureOrganization(clerkClient) {
  const existing = await findOrganizationBySlug(clerkClient, TENANT.slug);
  if (existing) {
    console.log(`  Organization "${TENANT.slug}" ya existe (${existing.id}), reusando.`);
    return existing;
  }
  const org = await clerkClient.organizations.createOrganization({
    name: TENANT.name,
    slug: TENANT.slug,
    publicMetadata: { tenant_id: TENANT.id, tenant_slug: TENANT.slug },
  });
  console.log(`  Organization "${TENANT.slug}" creada (${org.id}).`);
  return org;
}

async function ensureUser(clerkClient, demoUser) {
  const existing = await findUserByUsername(clerkClient, demoUser.username);
  if (existing) {
    console.log(`  Usuario "${demoUser.username}" ya existe en Clerk (${existing.id}), reusando.`);
    return existing;
  }
  const user = await clerkClient.users.createUser({
    emailAddress: [demoUser.email],
    username: demoUser.username,
    password: demoUser.password,
    firstName: demoUser.firstName,
    lastName: demoUser.lastName,
    skipPasswordChecks: true,
  });
  console.log(`  Usuario "${demoUser.username}" creado (${user.id}).`);
  return user;
}

async function ensureMembership(clerkClient, org, user, demoUser) {
  const { data: memberships } = await clerkClient.organizations.getOrganizationMembershipList({ organizationId: org.id, userId: [user.id] });
  const clerkRole = demoUser.role === 'owner' ? 'org:admin' : 'org:member';
  if (memberships.length) {
    console.log(`  Membership de "${demoUser.username}" ya existe, actualizando metadata.`);
  } else {
    await clerkClient.organizations.createOrganizationMembership({ organizationId: org.id, userId: user.id, role: clerkRole });
    console.log(`  Membership de "${demoUser.username}" creada (rol Clerk: ${clerkRole}).`);
  }
  await clerkClient.organizations.updateOrganizationMembershipMetadata({
    organizationId: org.id,
    userId: user.id,
    publicMetadata: { role: demoUser.role, username: demoUser.username },
  });
}

async function main() {
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) {
    console.error('Falta CLERK_SECRET_KEY en el entorno. Uso: CLERK_SECRET_KEY=sk_live_... node Backend/scripts/migrate-demo-users-to-clerk.js');
    process.exit(1);
  }

  const clerkClient = createClerkClient({ secretKey });

  console.log(`Migrando tenant "${TENANT.slug}" y ${DEMO_USERS.length} usuarios demo a Clerk...`);

  const org = await ensureOrganization(clerkClient);

  for (const demoUser of DEMO_USERS) {
    const user = await ensureUser(clerkClient, demoUser);
    await ensureMembership(clerkClient, org, user, demoUser);
  }

  console.log('Listo. El webhook de orders-service deberia haber sincronizado tenants.clerk_org_id y users.clerk_user_id -- verificar en la base o el dashboard de Clerk (Logs de Webhooks).');
}

main().catch((err) => {
  console.error('Migracion fallida:', err.message || err);
  if (err.status) console.error('  status:', err.status);
  if (Array.isArray(err.errors)) {
    for (const e of err.errors) {
      console.error('  -', e.code || '(sin codigo)', '|', e.message || '', '|', e.longMessage || '');
    }
  }
  if (err.clerkTraceId) console.error('  clerkTraceId:', err.clerkTraceId);
  process.exit(1);
});
