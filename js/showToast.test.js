const { showToast } = require('./showToast');

describe('showToast function', () => {
  beforeEach(() => {
    // Set up our document body
    document.body.innerHTML = `
      <div id="toast" class="toast"></div>
    `;

    // We want to mock setTimeout and other timer functions
    jest.useFakeTimers();
  });

  afterEach(() => {
    // Restore real timers
    jest.useRealTimers();
  });

  test('should set the message on the toast element', () => {
    showToast('Hello World');

    const toast = document.getElementById('toast');
    expect(toast.textContent).toBe('Hello World');
  });

  test('should add the "show" class to the toast element', () => {
    showToast('Test Message');

    const toast = document.getElementById('toast');
    expect(toast.classList.contains('show')).toBe(true);
  });

  test('should add the provided type as a class if specified', () => {
    showToast('Success!', 'success');

    const toast = document.getElementById('toast');
    // It should have 'toast', 'success', and 'show' classes
    expect(toast.className).toContain('toast');
    expect(toast.className).toContain('success');
    expect(toast.classList.contains('show')).toBe(true);
  });

  test('should not add a type class if type is empty string', () => {
    showToast('Info message', '');

    const toast = document.getElementById('toast');
    expect(toast.className).toBe('toast show');
  });

  test('should not add a type class if type is omitted', () => {
    showToast('Info message');

    const toast = document.getElementById('toast');
    expect(toast.className).toBe('toast show');
  });

  test('should remove the "show" class after 3500ms', () => {
    showToast('Disappearing message');

    const toast = document.getElementById('toast');
    expect(toast.classList.contains('show')).toBe(true);

    // Fast-forward time by 3499ms
    jest.advanceTimersByTime(3499);
    // Still showing
    expect(toast.classList.contains('show')).toBe(true);

    // Fast-forward time by 1ms (total 3500ms)
    jest.advanceTimersByTime(1);
    // Should be hidden
    expect(toast.classList.contains('show')).toBe(false);
  });
});
