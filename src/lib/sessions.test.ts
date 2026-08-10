import { describe, expect, it } from 'vitest';
import type { MonthData } from '../types';
import {
  addSession,
  clearSessions,
  createSession,
  deleteSession,
  hasErrors,
  pruneOrphanSessions,
  recentSessions,
  sessionsForTask,
  validateSessionForm,
} from './sessions';
import { addTask, createTask, emptyMonth } from './tasks';
import { MAX_SESSION_SECONDS } from './time';

const at = (day: number, hour: number) =>
  new Date(2026, 7, day, hour, 0, 0, 0).toISOString();

/** A month holding one task, with the task id returned for convenience. */
function monthWithTask(): { data: MonthData; taskId: string } {
  const data = addTask(emptyMonth(), createTask({ name: 'Gym', target: 20 }));
  return { data, taskId: data.tasks[0].id };
}

describe('createSession', () => {
  it('derives the duration from the interval', () => {
    const session = createSession({ taskId: 't', startTime: at(9, 10), endTime: at(9, 12) });
    expect(session.durationSeconds).toBe(7200);
    expect(session.id).toBeTruthy();
    expect(session.createdAt).toBeTruthy();
  });

  it('clamps a session longer than a day', () => {
    const session = createSession({ taskId: 't', startTime: at(1, 0), endTime: at(9, 0) });
    expect(session.durationSeconds).toBe(MAX_SESSION_SECONDS);
  });

  it('never produces a negative duration', () => {
    const session = createSession({ taskId: 't', startTime: at(9, 12), endTime: at(9, 10) });
    expect(session.durationSeconds).toBe(0);
  });
});

describe('session collection operations', () => {
  it('keeps sessions sorted by start time', () => {
    const { data, taskId } = monthWithTask();
    const late = createSession({ taskId, startTime: at(9, 18), endTime: at(9, 19) });
    const early = createSession({ taskId, startTime: at(9, 8), endTime: at(9, 9) });

    const withBoth = addSession(addSession(data, late), early);
    expect(withBoth.sessions.map((session) => session.id)).toEqual([early.id, late.id]);
  });

  it('lists recent sessions newest first and can limit them', () => {
    const { data, taskId } = monthWithTask();
    let month = data;
    for (const hour of [8, 12, 18]) {
      month = addSession(
        month,
        createSession({ taskId, startTime: at(9, hour), endTime: at(9, hour + 1) }),
      );
    }

    const recent = recentSessions(month, 2);
    expect(recent).toHaveLength(2);
    expect(recent[0].startTime > recent[1].startTime).toBe(true);
    expect(recentSessions(month)).toHaveLength(3);
  });

  it('deletes one session and leaves the rest', () => {
    const { data, taskId } = monthWithTask();
    const first = createSession({ taskId, startTime: at(9, 8), endTime: at(9, 9) });
    const second = createSession({ taskId, startTime: at(9, 10), endTime: at(9, 11) });
    const month = addSession(addSession(data, first), second);

    expect(deleteSession(month, first.id).sessions.map((s) => s.id)).toEqual([second.id]);
    expect(deleteSession(month, 'missing').sessions).toHaveLength(2);
  });

  it('clears every session without touching tasks', () => {
    const { data, taskId } = monthWithTask();
    const month = addSession(data, createSession({ taskId, startTime: at(9, 8), endTime: at(9, 9) }));

    const cleared = clearSessions(month);
    expect(cleared.sessions).toEqual([]);
    expect(cleared.tasks).toEqual(month.tasks);
  });

  it('selects the sessions of one task', () => {
    const { data, taskId } = monthWithTask();
    const month = addSession(
      addSession(data, createSession({ taskId, startTime: at(9, 8), endTime: at(9, 9) })),
      createSession({ taskId: 'other', startTime: at(9, 10), endTime: at(9, 11) }),
    );

    expect(sessionsForTask(month, taskId)).toHaveLength(1);
    expect(sessionsForTask(month, 'nobody')).toEqual([]);
  });

  it('prunes sessions whose task is gone', () => {
    const { data, taskId } = monthWithTask();
    const month = addSession(
      addSession(data, createSession({ taskId, startTime: at(9, 8), endTime: at(9, 9) })),
      createSession({ taskId: 'deleted', startTime: at(9, 10), endTime: at(9, 11) }),
    );

    const pruned = pruneOrphanSessions(month);
    expect(pruned.sessions).toHaveLength(1);
    expect(pruned.sessions[0].taskId).toBe(taskId);
  });
});

describe('validateSessionForm', () => {
  const base = {
    taskId: 'a',
    date: '2026-08-09',
    startTime: '09:00',
    duration: '45',
    knownTaskIds: ['a'],
  };

  it('accepts a well-formed entry', () => {
    expect(hasErrors(validateSessionForm(base))).toBe(false);
  });

  it('requires a task that exists in the month', () => {
    expect(validateSessionForm({ ...base, taskId: '' }).taskId).toMatch(/choose a task/i);
    expect(validateSessionForm({ ...base, taskId: 'z' }).taskId).toMatch(/not in this month/i);
  });

  it('rejects a malformed date or time', () => {
    expect(validateSessionForm({ ...base, date: '9 Aug' }).date).toBeTruthy();
    expect(validateSessionForm({ ...base, startTime: '9am' }).startTime).toBeTruthy();
  });

  it('rejects unusable durations', () => {
    expect(validateSessionForm({ ...base, duration: '' }).duration).toBeTruthy();
    expect(validateSessionForm({ ...base, duration: '0' }).duration).toMatch(/more than zero/i);
    expect(validateSessionForm({ ...base, duration: '25h' }).duration).toMatch(/24 hours/i);
  });
});
