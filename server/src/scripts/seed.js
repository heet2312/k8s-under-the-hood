/**
 * scripts/seed.js
 *
 * ─────────────────────────────────────────────────────────────────
 * DATABASE SEED SCRIPT
 * ─────────────────────────────────────────────────────────────────
 * Purpose:
 *   Clears all domain collections and inserts a rich, realistic
 *   dataset for local development and integration testing.
 *
 * Usage:
 *   node src/scripts/seed.js
 *
 * WARNING:
 *   This script DROPS existing data. Never run against production.
 *   Guard with NODE_ENV check at the bottom.
 *
 * Architecture decisions:
 *   - Imports Mongoose models directly — benefits from schema validation.
 *   - Uses insertMany() with ordered: false so partial failures don't
 *     block remaining inserts (they are logged instead).
 *   - References between documents are wired using the _id values
 *     returned from the previous insertMany calls.
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import Workspace from '../models/Workspace.js';
import Project, { PROJECT_STATUS } from '../models/Project.js';
import Task, { TASK_STATUS, TASK_PRIORITY } from '../models/Task.js';
import logger from '../utils/logger.js';

// ════════════════════════════════════════════════════════════════════════════
// SEED DATA DEFINITIONS
// ════════════════════════════════════════════════════════════════════════════

const WORKSPACE_DATA = [
  {
    name: 'Acme Corp Engineering',
    description: 'Core product engineering workspace for the Acme platform.',
    members: ['alice@acme.com', 'bob@acme.com', 'carol@acme.com', 'dave@acme.com'],
  },
  {
    name: 'Acme Corp Design',
    description: 'UX/UI design and brand workspace.',
    members: ['eve@acme.com', 'frank@acme.com'],
  },
];

// Projects are defined as a function that receives workspace _ids
const buildProjectData = (workspaceIds) => [
  {
    name: 'Customer Portal v3',
    description: 'Complete rebuild of the customer-facing portal with React and a new design system.',
    status: PROJECT_STATUS.ACTIVE,
    workspace: workspaceIds[0], // Acme Engineering
    dueDate: new Date('2026-09-30'),
  },
  {
    name: 'Internal Analytics Dashboard',
    description: 'Real-time metrics dashboard for the ops and growth teams.',
    status: PROJECT_STATUS.PLANNING,
    workspace: workspaceIds[0],
    dueDate: new Date('2026-12-01'),
  },
  {
    name: 'Mobile App v2',
    description: 'React Native rewrite of the legacy iOS/Android app.',
    status: PROJECT_STATUS.ACTIVE,
    workspace: workspaceIds[0],
    dueDate: new Date('2026-11-15'),
  },
  {
    name: 'Q3 Brand Refresh',
    description: 'Update logo, color palette, and typography across all touchpoints.',
    status: PROJECT_STATUS.ACTIVE,
    workspace: workspaceIds[1], // Acme Design
    dueDate: new Date('2026-08-01'),
  },
  {
    name: 'Migration to Kubernetes',
    description: 'Migrating legacy monolith into containerized microservices orchestrated by k8s.',
    status: PROJECT_STATUS.ACTIVE,
    workspace: workspaceIds[0], // Acme Engineering
    dueDate: new Date('2026-10-31'),
  },
  {
    name: 'Security Audit & Compliance',
    description: 'SOC2 Type II compliance audit and penetration testing fixes.',
    status: PROJECT_STATUS.PLANNING,
    workspace: workspaceIds[0], // Acme Engineering
    dueDate: new Date('2027-01-15'),
  },
  {
    name: 'Social Media Campaign Q4',
    description: 'End of year digital marketing push across social channels.',
    status: PROJECT_STATUS.PLANNING,
    workspace: workspaceIds[1], // Acme Design
    dueDate: new Date('2026-11-30'),
  },
];

// Tasks are defined as a function that receives project _ids
const buildTaskData = (projectIds) => [
  // ── Customer Portal v3 tasks ──────────────────────────────────────────────
  {
    title: 'Set up monorepo with Turborepo',
    description: 'Initialize the Turborepo workspace with shared packages for UI components and utilities.',
    status: TASK_STATUS.DONE,
    priority: TASK_PRIORITY.HIGH,
    project: projectIds[0],
    assignedTo: 'alice@acme.com',
    estimatedHours: 8,
    loggedHours: 7.5,
    labels: ['infrastructure', 'setup'],
    dueDate: new Date('2026-05-01'),
  },
  {
    title: 'Design token system implementation',
    description: 'Port Figma tokens to CSS custom properties and integrate with the component library.',
    status: TASK_STATUS.IN_PROGRESS,
    priority: TASK_PRIORITY.HIGH,
    project: projectIds[0],
    assignedTo: 'bob@acme.com',
    estimatedHours: 12,
    loggedHours: 5,
    labels: ['design-system', 'frontend'],
    dueDate: new Date('2026-05-15'),
  },
  {
    title: 'Build authentication flow (OAuth 2.0)',
    description: 'Implement login, logout, token refresh, and protected route guards using OAuth 2.0 + PKCE.',
    status: TASK_STATUS.IN_PROGRESS,
    priority: TASK_PRIORITY.CRITICAL,
    project: projectIds[0],
    assignedTo: 'carol@acme.com',
    estimatedHours: 20,
    loggedHours: 8,
    labels: ['auth', 'security', 'backend'],
    dueDate: new Date('2026-05-20'),
  },
  {
    title: 'API integration layer with React Query',
    description: 'Set up React Query for all server-state management, data fetching, and cache invalidation.',
    status: TASK_STATUS.TODO,
    priority: TASK_PRIORITY.HIGH,
    project: projectIds[0],
    assignedTo: 'alice@acme.com',
    estimatedHours: 16,
    labels: ['frontend', 'data-fetching'],
  },
  {
    title: 'Write E2E tests for critical user journeys',
    description: 'Playwright tests covering login, dashboard, and checkout flows.',
    status: TASK_STATUS.TODO,
    priority: TASK_PRIORITY.MEDIUM,
    project: projectIds[0],
    assignedTo: 'dave@acme.com',
    estimatedHours: 24,
    labels: ['testing', 'quality'],
  },

  // ── Analytics Dashboard tasks ─────────────────────────────────────────────
  {
    title: 'Define KPI requirements with stakeholders',
    description: 'Workshop with product and growth teams to finalize the metrics to track.',
    status: TASK_STATUS.DONE,
    priority: TASK_PRIORITY.HIGH,
    project: projectIds[1],
    assignedTo: 'bob@acme.com',
    estimatedHours: 4,
    loggedHours: 6,
    labels: ['requirements', 'discovery'],
  },
  {
    title: 'Set up ClickHouse for OLAP queries',
    description: 'Provision ClickHouse cluster, define data model, and wire up ingestion pipeline.',
    status: TASK_STATUS.IN_REVIEW,
    priority: TASK_PRIORITY.CRITICAL,
    project: projectIds[1],
    assignedTo: 'carol@acme.com',
    estimatedHours: 32,
    loggedHours: 28,
    labels: ['data', 'infrastructure'],
  },
  {
    title: 'Build chart components with Recharts',
    description: 'Line, bar, funnel, and cohort retention charts to cover all the required visualizations.',
    status: TASK_STATUS.TODO,
    priority: TASK_PRIORITY.MEDIUM,
    project: projectIds[1],
    assignedTo: 'alice@acme.com',
    estimatedHours: 20,
    labels: ['frontend', 'charts'],
  },

  // ── Mobile App v2 tasks ───────────────────────────────────────────────────
  {
    title: 'Scaffold React Native project with Expo',
    description: 'Initialize Expo managed workflow, set up navigation with React Navigation v7.',
    status: TASK_STATUS.DONE,
    priority: TASK_PRIORITY.HIGH,
    project: projectIds[2],
    assignedTo: 'dave@acme.com',
    estimatedHours: 6,
    loggedHours: 5,
    labels: ['mobile', 'setup'],
  },
  {
    title: 'Port core business logic to shared package',
    description: 'Extract validation, formatting, and API client into a shared TS package used by web and mobile.',
    status: TASK_STATUS.IN_PROGRESS,
    priority: TASK_PRIORITY.HIGH,
    project: projectIds[2],
    assignedTo: 'bob@acme.com',
    estimatedHours: 14,
    loggedHours: 4,
    labels: ['architecture', 'shared-code'],
  },
  {
    title: 'Implement push notifications',
    description: 'Expo Notifications + backend webhook to send order and alert push messages.',
    status: TASK_STATUS.TODO,
    priority: TASK_PRIORITY.MEDIUM,
    project: projectIds[2],
    assignedTo: 'carol@acme.com',
    estimatedHours: 10,
    labels: ['mobile', 'notifications'],
  },

  // ── Q3 Brand Refresh tasks (Design workspace) ─────────────────────────────
  {
    title: 'Competitor brand audit',
    description: 'Analyze top 5 competitors\' visual identities and compile findings.',
    status: TASK_STATUS.DONE,
    priority: TASK_PRIORITY.MEDIUM,
    project: projectIds[3],
    assignedTo: 'eve@acme.com',
    estimatedHours: 8,
    loggedHours: 10,
    labels: ['research', 'brand'],
  },
  {
    title: 'New logo concepts (3 directions)',
    description: 'Present three distinct logo directions to stakeholders for feedback session.',
    status: TASK_STATUS.IN_PROGRESS,
    priority: TASK_PRIORITY.HIGH,
    project: projectIds[3],
    assignedTo: 'frank@acme.com',
    estimatedHours: 20,
    loggedHours: 12,
    labels: ['logo', 'brand'],
    dueDate: new Date('2026-06-15'),
  },
  {
    title: 'Update marketing site with new brand',
    description: 'Apply final brand tokens to the marketing site once design is approved.',
    status: TASK_STATUS.TODO,
    priority: TASK_PRIORITY.HIGH,
    project: projectIds[3],
    assignedTo: 'eve@acme.com',
    estimatedHours: 16,
    labels: ['frontend', 'brand', 'marketing'],
    dueDate: new Date('2026-07-15'),
  },

  // ── Migration to Kubernetes tasks ─────────────────────────────────────────
  {
    title: 'Dockerize legacy auth service',
    description: 'Create multi-stage Dockerfile and helm charts for the old auth system.',
    status: TASK_STATUS.IN_PROGRESS,
    priority: TASK_PRIORITY.HIGH,
    project: projectIds[4],
    assignedTo: 'alice@acme.com',
    estimatedHours: 24,
    loggedHours: 12,
    labels: ['infrastructure', 'kubernetes', 'docker'],
  },

  // ── Security Audit & Compliance tasks ──────────────────────────────────────
  {
    title: 'Patch critical CVEs in dependencies',
    description: 'Update vulnerable NPM packages flagged by Snyk audit.',
    status: TASK_STATUS.TODO,
    priority: TASK_PRIORITY.CRITICAL,
    project: projectIds[5],
    assignedTo: 'dave@acme.com',
    estimatedHours: 8,
    labels: ['security', 'maintenance'],
  },

  // ── Social Media Campaign Q4 tasks ────────────────────────────────────────
  {
    title: 'Draft Q4 campaign copy',
    description: 'Write engaging copy for LinkedIn and Twitter ad creatives.',
    status: TASK_STATUS.DONE,
    priority: TASK_PRIORITY.MEDIUM,
    project: projectIds[6],
    assignedTo: 'eve@acme.com',
    estimatedHours: 4,
    loggedHours: 5,
    labels: ['marketing', 'copywriting'],
  },
];

// ════════════════════════════════════════════════════════════════════════════
// SEED RUNNER
// ════════════════════════════════════════════════════════════════════════════

const runSeed = async () => {
  // ── Safety guard ───────────────────────────────────────────────────────────
  if (process.env.NODE_ENV === 'production') {
    logger.error('Seed script refused to run in production environment. Exiting.');
    process.exit(1);
  }

  const uri = process.env.MONGO_URI;
  if (!uri) {
    logger.error('MONGO_URI is not set. Aborting seed.');
    process.exit(1);
  }

  logger.info('═══════════════════════════════════════════════');
  logger.info('  TaskFlow — Database Seed Script');
  logger.info('═══════════════════════════════════════════════');
  logger.info(`  Target: ${uri.replace(/\/\/.*@/, '//<credentials>@')}\n`);

  try {
    await mongoose.connect(uri, { bufferCommands: false });
    logger.info('  ✓ MongoDB connected.\n');

    // ── Step 1: Clear all collections ────────────────────────────────────────
    logger.info('  [1/4] Clearing existing data...');
    const [wDel, pDel, tDel] = await Promise.all([
      Workspace.deleteMany({}),
      Project.deleteMany({}),
      Task.deleteMany({}),
    ]);
    logger.info(`        Removed: ${wDel.deletedCount} workspace(s), ${pDel.deletedCount} project(s), ${tDel.deletedCount} task(s).`);

    // ── Step 2: Insert Workspaces ─────────────────────────────────────────────
    logger.info('\n  [2/4] Inserting workspaces...');
    const workspaces = await Workspace.insertMany(WORKSPACE_DATA, { ordered: true });
    const workspaceIds = workspaces.map((w) => w._id);
    workspaces.forEach((w) => logger.info(`        ✓ Workspace: "${w.name}" [${w._id}]`));

    // ── Step 3: Insert Projects ───────────────────────────────────────────────
    logger.info('\n  [3/4] Inserting projects...');
    const projects = await Project.insertMany(buildProjectData(workspaceIds), { ordered: true });
    const projectIds = projects.map((p) => p._id);
    projects.forEach((p) => logger.info(`        ✓ Project: "${p.name}" [${p._id}] → Workspace [${p.workspace}]`));

    // ── Step 4: Insert Tasks ──────────────────────────────────────────────────
    logger.info('\n  [4/4] Inserting tasks...');
    const tasks = await Task.insertMany(buildTaskData(projectIds), { ordered: false });
    tasks.forEach((t) => logger.info(`        ✓ Task: "${t.title}" [${t.status}/${t.priority}] → Project [${t.project}]`));

    // ── Summary ───────────────────────────────────────────────────────────────
    logger.info('\n═══════════════════════════════════════════════');
    logger.info('  Seed complete!');
    logger.info(`    Workspaces : ${workspaces.length}`);
    logger.info(`    Projects   : ${projects.length}`);
    logger.info(`    Tasks      : ${tasks.length}`);
    logger.info('═══════════════════════════════════════════════\n');
  } catch (err) {
    logger.error(`Seed failed: ${err.message}`);
    if (err.writeErrors) {
      err.writeErrors.forEach((we) => logger.error(`  Write error: ${we.errmsg}`));
    }
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    logger.info('  MongoDB connection closed.');
    process.exit(0);
  }
};

runSeed();
