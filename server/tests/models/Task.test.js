/**
 * tests/models/Task.test.js
 * 
 * Unit tests for the Task Mongoose Model.
 * Verifies that the schema validations (required fields, enums, etc.) work properly.
 */

import mongoose from 'mongoose';
import Task, { TASK_STATUS, TASK_PRIORITY } from '../../src/models/Task.js';
import Project from '../../src/models/Project.js';
import Workspace from '../../src/models/Workspace.js';

describe('Task Model Test', () => {
  let projectId;

  beforeEach(async () => {
    // Generate valid ObjectIds so Mongoose validation passes
    const workspaceId = new mongoose.Types.ObjectId();
    projectId = new mongoose.Types.ObjectId();
  });

  it('create & save a task successfully', async () => {
    const taskData = {
      title: 'Setup GitHub Actions',
      project: projectId,
      status: TASK_STATUS.TODO,
      priority: TASK_PRIORITY.HIGH,
      assignedTo: 'test@example.com'
    };

    const validTask = new Task(taskData);
    const savedTask = await validTask.save();

    // Verify successful save and correct default values
    expect(savedTask._id).toBeDefined();
    expect(savedTask.title).toBe(taskData.title);
    expect(savedTask.project.toString()).toBe(projectId.toString());
    expect(savedTask.status).toBe(TASK_STATUS.TODO);
    expect(savedTask.priority).toBe(TASK_PRIORITY.HIGH);
    expect(savedTask.isDeleted).toBe(false); // default value
    expect(savedTask.dueDate).toBeNull();    // default value
  });

  it('insert task successfully, but the field not defined in schema should be undefined', async () => {
    const taskData = { 
      title: 'Invalid Field Task', 
      project: projectId,
      hackerField: 'I am not mapped' // Not in schema
    };

    const taskWithInvalidField = new Task(taskData);
    const savedTask = await taskWithInvalidField.save();
    
    expect(savedTask._id).toBeDefined();
    expect(savedTask.hackerField).toBeUndefined(); // Mongoose stripped it out
  });

  it('create task without required field should fail', async () => {
    const taskWithoutRequiredField = new Task({ title: 'No Project Task' }); // Missing 'project' FK
    let error;

    try {
      await taskWithoutRequiredField.save();
    } catch (err) {
      error = err;
    }

    expect(error).toBeInstanceOf(mongoose.Error.ValidationError);
    expect(error.errors.project).toBeDefined();
  });

  it('create task with invalid enum should fail', async () => {
    const invalidStatusTask = new Task({
      title: 'Invalid Status',
      project: projectId,
      status: 'Super Done' // Invalid status string
    });

    let error;
    try {
      await invalidStatusTask.save();
    } catch (err) {
      error = err;
    }

    expect(error).toBeInstanceOf(mongoose.Error.ValidationError);
    expect(error.errors.status.message).toMatch(/Status must be one of/);
  });
});
