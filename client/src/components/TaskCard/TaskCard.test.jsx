import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TaskCard from './TaskCard.jsx';

describe('TaskCard Component', () => {
  const mockTask = {
    _id: '1',
    title: 'Test Card Rendering',
    description: 'Verifying that this task card renders properly.',
    status: 'In Progress',
    priority: 'High',
    assignedTo: 'jane@example.com',
    dueDate: '2026-10-15T00:00:00Z',
    labels: ['frontend', 'bug']
  };

  it('renders task details correctly', () => {
    render(<TaskCard task={mockTask} />);

    // Renders the title
    expect(screen.getByText('Test Card Rendering')).toBeInTheDocument();
    
    // Renders the status badge
    expect(screen.getByText('In Progress')).toBeInTheDocument();
    
    // Renders labels
    expect(screen.getByText('frontend')).toBeInTheDocument();
    expect(screen.getByText('bug')).toBeInTheDocument();
    
    // Renders initial of assignee
    expect(screen.getByText('J')).toBeInTheDocument();
  });

  it('calls onClick when clicking the card', async () => {
    const handleClick = vi.fn();
    render(<TaskCard task={mockTask} onClick={handleClick} />);

    const card = screen.getByText('Test Card Rendering').closest('.task-card');
    await userEvent.click(card);

    expect(handleClick).toHaveBeenCalledTimes(1);
    expect(handleClick).toHaveBeenCalledWith(mockTask);
  });

  it('calls onDelete and prevents default when clicking the delete button', async () => {
    const handleDelete = vi.fn();
    const handleClick = vi.fn();
    render(<TaskCard task={mockTask} onClick={handleClick} onDelete={handleDelete} />);

    const deleteBtn = screen.getByRole('button', { name: /delete task/i });
    await userEvent.click(deleteBtn);

    expect(handleDelete).toHaveBeenCalledTimes(1);
    expect(handleDelete).toHaveBeenCalledWith(mockTask);
    // Ensure the card click wasn't triggered
    expect(handleClick).not.toHaveBeenCalled();
  });
});
