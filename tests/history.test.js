import { describe, it, expect, beforeEach } from 'vitest';
import { createHistory } from '../src/history.js';

describe('createHistory', () => {
  let history;

  beforeEach(() => {
    history = createHistory();
  });

  // ── 초기 상태 ──
  it('초기 상태: current === null', () => {
    expect(history.current()).toBeNull();
  });

  it('초기 상태: canBack() === false', () => {
    expect(history.canBack()).toBe(false);
  });

  it('초기 상태: canForward() === false', () => {
    expect(history.canForward()).toBe(false);
  });

  it('초기 상태: back() → null', () => {
    expect(history.back()).toBeNull();
  });

  it('초기 상태: forward() → null', () => {
    expect(history.forward()).toBeNull();
  });

  // ── push ──
  it('push 하나 → current가 해당 항목', () => {
    const v1 = { type: 'div' };
    history.push(v1);
    expect(history.current()).toBe(v1);
  });

  it('push 여러 개 → current는 마지막 항목', () => {
    history.push({ id: 1 });
    history.push({ id: 2 });
    history.push({ id: 3 });
    expect(history.current()).toEqual({ id: 3 });
  });

  it('push 하나만 있으면 canBack() === false', () => {
    history.push({ id: 1 });
    expect(history.canBack()).toBe(false);
  });

  it('push 두 개 이상이면 canBack() === true', () => {
    history.push({ id: 1 });
    history.push({ id: 2 });
    expect(history.canBack()).toBe(true);
  });

  it('push 후 forwardStack 초기화 확인', () => {
    history.push({ id: 1 });
    history.push({ id: 2 });
    history.back();
    expect(history.canForward()).toBe(true);

    history.push({ id: 3 }); // forwardStack 비워야 함
    expect(history.canForward()).toBe(false);
  });

  // ── back ──
  it('back() → 이전 항목 반환', () => {
    const v1 = { id: 1 };
    const v2 = { id: 2 };
    history.push(v1);
    history.push(v2);
    expect(history.back()).toBe(v1);
    expect(history.current()).toBe(v1);
  });

  it('back() 후 canForward() === true', () => {
    history.push({ id: 1 });
    history.push({ id: 2 });
    history.back();
    expect(history.canForward()).toBe(true);
  });

  it('맨 처음 항목에서 back() → null 반환, current 유지', () => {
    const v1 = { id: 1 };
    history.push(v1);
    const result = history.back();
    expect(result).toBeNull();
    expect(history.current()).toBe(v1);
  });

  it('여러 번 back() 반복', () => {
    history.push({ id: 1 });
    history.push({ id: 2 });
    history.push({ id: 3 });

    expect(history.back()).toEqual({ id: 2 });
    expect(history.back()).toEqual({ id: 1 });
    expect(history.back()).toBeNull(); // 더 이상 없음
  });

  // ── forward ──
  it('forward() → 앞으로 이동', () => {
    const v1 = { id: 1 };
    const v2 = { id: 2 };
    history.push(v1);
    history.push(v2);
    history.back();
    expect(history.forward()).toBe(v2);
    expect(history.current()).toBe(v2);
  });

  it('back 없이 forward() → null', () => {
    history.push({ id: 1 });
    expect(history.forward()).toBeNull();
  });

  it('back 끝까지 간 후 forward 반복', () => {
    history.push({ id: 1 });
    history.push({ id: 2 });
    history.push({ id: 3 });

    history.back();
    history.back();

    expect(history.forward()).toEqual({ id: 2 });
    expect(history.forward()).toEqual({ id: 3 });
    expect(history.forward()).toBeNull(); // 더 이상 없음
  });

  it('forward() 후 canForward() 갱신', () => {
    history.push({ id: 1 });
    history.push({ id: 2 });
    history.back();
    history.forward();
    expect(history.canForward()).toBe(false);
  });

  // ── 복합 시나리오 ──
  it('push → back → push → forwardStack 초기화', () => {
    history.push({ id: 1 });
    history.push({ id: 2 });
    history.back(); // forwardStack: [v2]
    history.push({ id: 3 }); // forwardStack 초기화
    expect(history.canForward()).toBe(false);
    expect(history.current()).toEqual({ id: 3 });
  });

  it('여러 push / back / forward 혼합 시나리오', () => {
    history.push('a');
    history.push('b');
    history.push('c');

    history.back(); // current: 'b'
    history.back(); // current: 'a'
    history.forward(); // current: 'b'
    history.push('d'); // forwardStack 초기화

    expect(history.current()).toBe('d');
    expect(history.canForward()).toBe(false);
    expect(history.canBack()).toBe(true);
  });
});
