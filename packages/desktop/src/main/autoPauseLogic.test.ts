import { describe, it, expect } from 'vitest';
import type { WorkSession } from '@swit/shared';
import {
  decideAutoPause,
  parseAutoPauseSettings,
  type AutoPauseState
} from './autoPauseLogic';

// Фиксированный «сейчас» для детерминированных тестов бэкдейта.
const NOW_MS = Date.parse('2026-06-08T12:00:00.000Z');

function session(over: Partial<WorkSession> = {}): WorkSession {
  return {
    id: 's1',
    date: '2026-06-08',
    started_at: '2026-06-08T11:00:00.000Z',
    ended_at: null,
    type: 'work',
    task_id: null,
    notes: null,
    ...over
  };
}

function state(over: Partial<AutoPauseState> = {}): AutoPauseState {
  return {
    idleSec: 0,
    idleThresholdSec: 60,
    active: null,
    autoPaused: false,
    autoPauseSessionId: null,
    nowMs: NOW_MS,
    ...over
  };
}

describe('decideAutoPause — постановка на паузу', () => {
  it('ставит на паузу при достижении порога, закрывая работу в момент начала простоя', () => {
    const action = decideAutoPause(
      state({ active: session({ type: 'work' }), idleSec: 60, idleThresholdSec: 60 })
    );
    expect(action).toEqual({
      kind: 'pause',
      // Работа заканчивается там, где активность прекратилась: 60 c назад от NOW =
      // 11:59:00. Сама пауза стартует «сейчас» (в слое ввода-вывода) → её таймер с 0.
      endWorkAt: '2026-06-08T11:59:00.000Z'
    });
  });

  it('закрывает работу в момент, когда активность прекратилась (не «сейчас»)', () => {
    // 90 c простоя → работа должна закончиться в 11:58:30.
    const action = decideAutoPause(
      state({ active: session({ type: 'work' }), idleSec: 90, idleThresholdSec: 60 })
    );
    expect(action).toEqual({ kind: 'pause', endWorkAt: '2026-06-08T11:58:30.000Z' });
  });

  it('не закрывает работу раньше её собственного начала', () => {
    // Работа началась в 11:59:30, простой 120 c (начался бы в 11:58:00).
    // Конец работы не может быть раньше её начала → 11:59:30.
    const action = decideAutoPause(
      state({
        active: session({ type: 'work', started_at: '2026-06-08T11:59:30.000Z' }),
        idleSec: 120,
        idleThresholdSec: 60
      })
    );
    expect(action).toEqual({ kind: 'pause', endWorkAt: '2026-06-08T11:59:30.000Z' });
  });

  it('не ставит на паузу, пока простой меньше порога', () => {
    const action = decideAutoPause(
      state({ active: session({ type: 'work' }), idleSec: 59, idleThresholdSec: 60 })
    );
    expect(action).toEqual({ kind: 'none' });
  });

  it('никогда не начинает день сам, если открытой сессии нет', () => {
    const action = decideAutoPause(state({ active: null, idleSec: 9999 }));
    expect(action).toEqual({ kind: 'none' });
  });

  it('не трогает ручную паузу пользователя', () => {
    const action = decideAutoPause(
      state({ active: session({ type: 'pause' }), idleSec: 9999, idleThresholdSec: 60 })
    );
    expect(action).toEqual({ kind: 'none' });
  });

  it('не трогает перерыв (break)', () => {
    const action = decideAutoPause(
      state({ active: session({ type: 'break' }), idleSec: 9999, idleThresholdSec: 60 })
    );
    expect(action).toEqual({ kind: 'none' });
  });
});

describe('decideAutoPause — возобновление после нашей паузы', () => {
  const ourPause = session({ id: 'pause-1', type: 'pause' });
  const onOurPause = (over: Partial<AutoPauseState> = {}): AutoPauseState =>
    state({ autoPaused: true, autoPauseSessionId: 'pause-1', active: ourPause, ...over });

  it('держит паузу, пока активности нет (простой ≥ порога)', () => {
    const action = decideAutoPause(onOurPause({ idleSec: 120, idleThresholdSec: 60 }));
    expect(action).toEqual({ kind: 'none' });
  });

  it('возобновляет работу при первом касании (простой < порога)', () => {
    const action = decideAutoPause(onOurPause({ idleSec: 1, idleThresholdSec: 60 }));
    expect(action).toEqual({ kind: 'resume' });
  });

  it('возобновляет ровно на границе восстановления активности (idle=0)', () => {
    const action = decideAutoPause(onOurPause({ idleSec: 0, idleThresholdSec: 60 }));
    expect(action).toEqual({ kind: 'resume' });
  });
});

describe('decideAutoPause — отпускание контроля при вмешательстве пользователя', () => {
  it('отпускает, если пользователь завершил день (active = null)', () => {
    const action = decideAutoPause(
      state({ autoPaused: true, autoPauseSessionId: 'pause-1', active: null, idleSec: 0 })
    );
    expect(action).toEqual({ kind: 'release' });
  });

  it('отпускает, если пользователь возобновил работу руками (active стал work)', () => {
    const action = decideAutoPause(
      state({
        autoPaused: true,
        autoPauseSessionId: 'pause-1',
        active: session({ id: 'work-2', type: 'work' }),
        idleSec: 0
      })
    );
    expect(action).toEqual({ kind: 'release' });
  });

  it('отпускает, если активна ДРУГАЯ пауза (не наша по id)', () => {
    const action = decideAutoPause(
      state({
        autoPaused: true,
        autoPauseSessionId: 'pause-1',
        active: session({ id: 'pause-OTHER', type: 'pause' }),
        idleSec: 0
      })
    );
    expect(action).toEqual({ kind: 'release' });
  });

  it('отпускает, если пользователь ушёл на перерыв', () => {
    const action = decideAutoPause(
      state({
        autoPaused: true,
        autoPauseSessionId: 'pause-1',
        active: session({ id: 'pause-1', type: 'break' }),
        idleSec: 0
      })
    );
    expect(action).toEqual({ kind: 'release' });
  });
});

describe('parseAutoPauseSettings', () => {
  it('по умолчанию включена с порогом 60 c (пустые настройки)', () => {
    expect(parseAutoPauseSettings({})).toEqual({ enabled: true, idleThresholdSec: 60 });
  });

  it('читает минуты простоя и переводит в секунды', () => {
    expect(parseAutoPauseSettings({ auto_pause_idle_min: '5' })).toEqual({
      enabled: true,
      idleThresholdSec: 300
    });
  });

  it('поддерживает дробные минуты', () => {
    expect(parseAutoPauseSettings({ auto_pause_idle_min: '2.5' }).idleThresholdSec).toBe(150);
  });

  it('выключается при "0" и "false"', () => {
    expect(parseAutoPauseSettings({ auto_pause_enabled: '0' }).enabled).toBe(false);
    expect(parseAutoPauseSettings({ auto_pause_enabled: 'false' }).enabled).toBe(false);
  });

  it('включается при "1" и "true"', () => {
    expect(parseAutoPauseSettings({ auto_pause_enabled: '1' }).enabled).toBe(true);
    expect(parseAutoPauseSettings({ auto_pause_enabled: 'true' }).enabled).toBe(true);
  });

  it('откатывается к 60 c при некорректном/нулевом пороге', () => {
    expect(parseAutoPauseSettings({ auto_pause_idle_min: '0' }).idleThresholdSec).toBe(60);
    expect(parseAutoPauseSettings({ auto_pause_idle_min: 'abc' }).idleThresholdSec).toBe(60);
    expect(parseAutoPauseSettings({ auto_pause_idle_min: '' }).idleThresholdSec).toBe(60);
  });
});
