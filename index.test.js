const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

describe('Form Validation', () => {
  let dom;
  let document;
  let window;

  beforeAll(() => {
    // Suppress jsdom errors (like URL.createObjectURL is not a function)
    const virtualConsole = new (require('jsdom')).VirtualConsole();
    virtualConsole.on("error", () => { /* skip errors */ });

    const html = fs.readFileSync(path.resolve(__dirname, './index.html'), 'utf8');
    dom = new JSDOM(html, {
        runScripts: 'dangerously',
        virtualConsole
    });
    document = dom.window.document;
    window = dom.window;

    // Mock URL.createObjectURL to avoid the error inside jsdom evaluation
    window.URL.createObjectURL = jest.fn();
  });

  afterAll(() => {
    if (dom && dom.window) {
      dom.window.close();
    }
  });

  it('shows an error toast when required fields are empty', async () => {
    // Wait for scripts to load/execute
    await new Promise(resolve => setTimeout(resolve, 100));

    const form = document.getElementById('consultForm');
    expect(form).not.toBeNull();

    // Call the function directly if it's on window
    if (typeof window.handleFormSubmit === 'function') {
      const mockEvent = { preventDefault: jest.fn() };
      window.handleFormSubmit(mockEvent);
    } else {
      const event = new window.Event('submit', { cancelable: true });
      form.dispatchEvent(event);
    }

    const toast = document.getElementById('toast');
    expect(toast).not.toBeNull();

    expect(toast.textContent).toBe('Please fill in all required fields.');
    expect(toast.className).toContain('error');
    expect(toast.className).toContain('show');
  });
});
