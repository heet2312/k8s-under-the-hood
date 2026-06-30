/**
 * tests/api/taskRoutes.test.js
 * 
 * Integration tests utilizing supertest to assert HTTP status codes,
 * JSON validation responses, and successful database commits.
 */

import request from 'supertest';
import app from '../../src/app.js';
import Task from '../../src/models/Task.js';
import Project from '../../src/models/Project.js';
import Workspace from '../../src/models/Workspace.js';

describe('Task API Endpoints', () => {
  let workspace;
  let project;

  beforeEach(async () => {
    // Scaffold necessary relations before testing task routes
    workspace = await Workspace.create({ name: 'Integration Workspace' });
    project = await Project.create({ 
      name: 'Integration Project', 
      workspace: workspace._id 
    });
  });

  describe('POST /api/tasks', () => {
    it('should create a new task when given valid payload', async () => {
      const res = await request(app)
        .post('/api/tasks')
        .send({
          title: 'Test Create Task Route',
          project: project._id,
          status: 'Todo',
          priority: 'High'
        });

      expect(res.statusCode).toEqual(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.title).toBe('Test Create Task Route');
      expect(res.body.data.project._id.toString()).toBe(project._id.toString());
    });

    it('should return 422 Validation failed when missing required fields', async () => {
      const res = await request(app)
        .post('/api/tasks')
        .send({
          // Missing title
          project: project._id
        });

      expect(res.statusCode).toEqual(422);
      expect(res.body.success).toBe(false);
      expect(res.body.errors[0].field).toBe('title');
    });
    
    it('should return 404 if project does not exist', async () => {
      const fakeMongoId = '66205cf39f4adfa1be24a9dd';
      const res = await request(app)
        .post('/api/tasks')
        .send({
          title: 'Orphan Task',
          project: fakeMongoId
        });

      // Business logic catches missing foreign keys and throws 404 operational error
      expect(res.statusCode).toEqual(404);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/not found/i);
    });
  });

  describe('GET /api/tasks', () => {
    beforeEach(async () => {
      await Task.create([
        { title: 'Task 1', project: project._id, status: 'Todo' },
        { title: 'Task 2', project: project._id, status: 'Done' }
      ]);
    });

    it('should fetch tasks filtered by project', async () => {
      const res = await request(app)
        .get(`/api/tasks?project=${project._id}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.data.tasks.length).toBe(2);
      expect(res.body.data.pagination.total).toBe(2);
    });

    it('should require project query param', async () => {
      const res = await request(app).get('/api/tasks');
      expect(res.statusCode).toEqual(422);
      expect(res.body.errors[0].field).toBe('project');
    });
  });
});
