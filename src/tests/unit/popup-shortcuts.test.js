const { JSDOM } = require('jsdom');
const { COMMAND_LABELS, COMMAND_ORDER, splitShortcut, groupCommands, buildShortcutsFragment } =
    require('../../shared/popup-shortcuts.js');

const { document } = new JSDOM('<!DOCTYPE html>').window;

describe('splitShortcut', () => {
    test('tokenizes a compound shortcut', () => {
        expect(splitShortcut('Alt+Shift+M')).toEqual(['Alt', 'Shift', 'M']);
    });
    test('returns single-element array for a bare key', () => {
        expect(splitShortcut('F5')).toEqual(['F5']);
    });
    test('returns empty array for empty string', () => {
        expect(splitShortcut('')).toEqual([]);
    });
    test('returns empty array for null/undefined', () => {
        expect(splitShortcut(null)).toEqual([]);
        expect(splitShortcut(undefined)).toEqual([]);
    });
});

describe('groupCommands', () => {
    const commands = [
        { name: '_execute_action',          shortcut: 'Alt+Shift+M', description: '' },
        { name: 'download_tab_as_markdown', shortcut: 'Alt+Shift+D', description: 'Save' },
        { name: 'copy_selection_as_markdown', shortcut: '',          description: 'Copy sel' },
        { name: 'copy_tab_to_obsidian',     shortcut: '',            description: 'To Obsidian' },
        { name: 'toggle_reader_view',       shortcut: '',            description: 'Reader' },
        { name: 'unknown_command',          shortcut: 'Ctrl+Q',      description: 'Unknown' },
    ];

    test('puts commands with shortcuts in withShortcut', () => {
        const { withShortcut } = groupCommands(commands);
        expect(withShortcut.map(c => c.name)).toEqual(['_execute_action', 'download_tab_as_markdown']);
    });

    test('puts commands without shortcuts in withoutShortcut', () => {
        const { withoutShortcut } = groupCommands(commands);
        expect(withoutShortcut.map(c => c.name)).toContain('copy_selection_as_markdown');
        expect(withoutShortcut.map(c => c.name)).toContain('copy_tab_to_obsidian');
        expect(withoutShortcut.map(c => c.name)).toContain('toggle_reader_view');
    });

    test('omits commands not in COMMAND_ORDER', () => {
        const { withShortcut, withoutShortcut } = groupCommands(commands);
        const all = [...withShortcut, ...withoutShortcut].map(c => c.name);
        expect(all).not.toContain('unknown_command');
    });

    test('respects COMMAND_ORDER within each group', () => {
        const allOrdered = [...COMMAND_ORDER.map(id => ({ name: id, shortcut: '', description: '' }))];
        const { withoutShortcut } = groupCommands(allOrdered);
        expect(withoutShortcut.map(c => c.name)).toEqual(COMMAND_ORDER);
    });
});

describe('buildShortcutsFragment', () => {
    const mockCommands = [
        { name: '_execute_action',            shortcut: 'Alt+Shift+M', description: '' },
        { name: 'download_tab_as_markdown',   shortcut: 'Alt+Shift+D', description: 'Save tab' },
        { name: 'copy_selection_as_markdown', shortcut: '',            description: 'Copy sel' },
    ];

    function getWrapper(commands) {
        const frag = buildShortcutsFragment(document, commands);
        const div = document.createElement('div');
        div.appendChild(frag);
        return div;
    }

    test('produces two tables when some commands have shortcuts and some do not', () => {
        const div = getWrapper(mockCommands);
        expect(div.querySelectorAll('table.shortcuts-table')).toHaveLength(2);
    });

    test('first table has correct kbd tokens for a shortcut', () => {
        const div = getWrapper(mockCommands);
        const firstRow = div.querySelector('table:first-of-type tr');
        const kbds = firstRow.querySelectorAll('kbd');
        expect(Array.from(kbds).map(k => k.textContent)).toEqual(['Alt', 'Shift', 'M']);
    });

    test('uses COMMAND_LABELS for human-readable description', () => {
        const div = getWrapper(mockCommands);
        expect(div.textContent).toContain(COMMAND_LABELS['_execute_action']);
        expect(div.textContent).toContain(COMMAND_LABELS['copy_selection_as_markdown']);
    });

    test('adds a section label button before the unassigned table', () => {
        const div = getWrapper(mockCommands);
        const btn = div.querySelector('button.shortcuts-section-label');
        expect(btn).not.toBeNull();
        expect(btn.dataset.action).toBe('open-shortcut-settings');
        expect(btn.textContent).toContain('Assign in browser shortcuts');
    });

    test('no section label when all commands have shortcuts', () => {
        const allKeyed = mockCommands.filter(c => c.shortcut);
        const div = getWrapper(allKeyed);
        expect(div.querySelector('.shortcuts-section-label')).toBeNull();
        expect(div.querySelectorAll('table')).toHaveLength(1);
    });

    test('empty command list produces one empty table', () => {
        const div = getWrapper([]);
        expect(div.querySelectorAll('tr')).toHaveLength(0);
    });

    test('falls back to COMMAND_LABELS when available', () => {
        const div = getWrapper([
            { name: 'download_tab_as_markdown', shortcut: '', description: 'fallback used if label missing' }
        ]);
        expect(div.textContent).toContain(COMMAND_LABELS['download_tab_as_markdown']);
    });
});

describe('COMMAND_LABELS completeness', () => {
    test('all 9 COMMAND_ORDER IDs have a label', () => {
        expect(Object.keys(COMMAND_LABELS)).toHaveLength(9);
        for (const id of COMMAND_ORDER) {
            expect(COMMAND_LABELS[id]).toBeTruthy();
        }
    });
});
