/**
 * scripts/migrate.js
 *
 * ─────────────────────────────────────────────────────────────────
 * DATABASE MIGRATION SCRIPT
 * ─────────────────────────────────────────────────────────────────
 * Purpose:
 *   Applies schema migrations in order. Each migration is an object
 *   with a unique `id`, `description`, and `up()` function.
 *
 *   A `migrations` collection in MongoDB tracks which migrations have
 *   already been applied — so re-running this script is idempotent
 *   (safe to run multiple times; won't re-apply completed migrations).
 *
 * Usage:
 *   node src/scripts/migrate.js
 *
 * Architecture decisions:
 *   - "Applied" migrations are persisted in a `_migrations` collection.
 *   - Each migration's `up()` receives the mongoose.connection so it
 *     can use the raw MongoDB driver for low-level operations (e.g.
 *     renaming fields, creating indexes) alongside Mongoose models.
 *   - Migrations run sequentially (not in parallel) to avoid race conditions.
 *   - On any failure, the script logs the error and exits with code 1.
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import logger from '../utils/logger.js';

// ── Migration Registry ────────────────────────────────────────────────────────
// Add new migrations to the END of this array.
// Never modify or remove a migration that has already been applied to production.
const MIGRATIONS = [
  {
    id: '001_create_workspace_indexes',
    description: 'Ensure compound indexes on Workspace collection for query performance.',
    up: async (connection) => {
      const db = connection.db;
      const collection = db.collection('workspaces');

      await collection.createIndex({ name: 1, isDeleted: 1 }, { name: 'name_isDeleted_compound' });
      logger.info('  ✓ Index created: workspaces.name_isDeleted_compound');
    },
  },
  {
    id: '002_create_project_indexes',
    description: 'Ensure compound indexes on Project collection.',
    up: async (connection) => {
      const db = connection.db;
      const collection = db.collection('projects');

      await collection.createIndex({ workspace: 1, status: 1 }, { name: 'workspace_status_compound' });
      await collection.createIndex({ workspace: 1, isDeleted: 1 }, { name: 'workspace_isDeleted_compound' });
      logger.info('  ✓ Indexes created: projects compound indexes');
    },
  },
  {
    id: '003_create_task_indexes',
    description: 'Ensure all Task indexes including text search index.',
    up: async (connection) => {
      const db = connection.db;
      const collection = db.collection('tasks');

      await collection.createIndex(
        { project: 1, status: 1, priority: 1 },
        { name: 'project_status_priority_compound' }
      );
      await collection.createIndex(
        { assignedTo: 1, status: 1 },
        { name: 'assignedTo_status_compound' }
      );
      await collection.createIndex(
        { title: 'text', description: 'text' },
        { name: 'task_full_text_search', weights: { title: 10, description: 5 } }
      );
      logger.info('  ✓ Indexes created: tasks compound + text indexes');
    },
  },
  {
    id: '004_add_task_position_field',
    description: 'Add a "position" field to all existing tasks for drag-and-drop ordering.',
    up: async (connection) => {
      const db = connection.db;
      // $setOnInsert won't help here — we use updateMany to backfill
      const result = await db.collection('tasks').updateMany(
        { position: { $exists: false } },
        { $set: { position: 0 } }
      );
      logger.info(`  ✓ Backfilled 'position' field on ${result.modifiedCount} task(s).`);
    },
  },
];

// ── Migration Tracker Schema ──────────────────────────────────────────────────
const MigrationSchema = new mongoose.Schema({
  migrationId: { type: String, required: true, unique: true },
  description: { type: String },
  appliedAt: { type: Date, default: Date.now },
});

const Migration = mongoose.model('_Migration', MigrationSchema);

// ── Runner ────────────────────────────────────────────────────────────────────
const runMigrations = async () => {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    logger.error('MONGO_URI is not set. Aborting migration.');
    process.exit(1);
  }

  logger.info('═══════════════════════════════════════════════');
  logger.info('  TaskFlow — Database Migration Runner');
  logger.info('═══════════════════════════════════════════════');
  logger.info(`  Connecting to: ${uri.replace(/\/\/.*@/, '//<credentials>@')}`);

  try {
    await mongoose.connect(uri, { bufferCommands: false });
    logger.info('  ✓ MongoDB connected.\n');

    let applied = 0;
    let skipped = 0;

    for (const migration of MIGRATIONS) {
      // Check if this migration already ran
      const alreadyApplied = await Migration.exists({ migrationId: migration.id });

      if (alreadyApplied) {
        logger.info(`  → [SKIP] ${migration.id}: ${migration.description}`);
        skipped++;
        continue;
      }

      logger.info(`  → [RUN]  ${migration.id}: ${migration.description}`);

      try {
        await migration.up(mongoose.connection);

        // Record success in the tracking collection
        await Migration.create({
          migrationId: migration.id,
          description: migration.description,
        });

        logger.info(`  ✓ [DONE] ${migration.id}\n`);
        applied++;
      } catch (migrationError) {
        logger.error(`  ✗ [FAIL] ${migration.id}: ${migrationError.message}`);
        throw migrationError; // Stop the runner — don't apply subsequent migrations
      }
    }

    logger.info('═══════════════════════════════════════════════');
    logger.info(`  Migration complete: ${applied} applied, ${skipped} skipped.`);
    logger.info('═══════════════════════════════════════════════\n');
  } catch (err) {
    logger.error(`Migration runner failed: ${err.message}`);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    logger.info('  MongoDB connection closed.');
    process.exit(0);
  }
};

runMigrations();
