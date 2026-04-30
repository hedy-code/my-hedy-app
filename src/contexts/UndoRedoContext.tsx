import React, { createContext, useContext, useState, useCallback } from 'react';

export type Command = {
    actionName: string;
    undo: () => Promise<void>;
    redo: () => Promise<void>;
};

export interface UndoRedoContextType {
    pushCommand: (command: Command) => void;
    undo: () => Promise<void>;
    redo: () => Promise<void>;
    canUndo: boolean;
    canRedo: boolean;
    clearHistory: () => void;
}

const UndoRedoContext = createContext<UndoRedoContextType | null>(null);

export const UndoRedoProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [undoStack, setUndoStack] = useState<Command[]>([]);
    const [redoStack, setRedoStack] = useState<Command[]>([]);

    const MAX_HISTORY = 30; // 限制在 30 步

    const pushCommand = useCallback((command: Command) => {
        setUndoStack(prev => {
            const next = [...prev, command];
            if (next.length > MAX_HISTORY) return next.slice(next.length - MAX_HISTORY);
            return next;
        });
        setRedoStack([]); // 每次新操作清空重做栈
    }, []);

    const undo = useCallback(async () => {
        if (undoStack.length === 0) return;
        const command = undoStack[undoStack.length - 1];
        try {
            await command.undo();
            setUndoStack(prev => prev.slice(0, prev.length - 1));
            setRedoStack(prev => [...prev, command]);
            console.log(`已撤销: ${command.actionName}`);
        } catch (e) {
            console.error('撤销失败', e);
            alert(`撤销 "${command.actionName}" 失败!`);
        }
    }, [undoStack]);

    const redo = useCallback(async () => {
        if (redoStack.length === 0) return;
        const command = redoStack[redoStack.length - 1];
        try {
            await command.redo();
            setRedoStack(prev => prev.slice(0, prev.length - 1));
            setUndoStack(prev => [...prev, command]);
            console.log(`已重做: ${command.actionName}`);
        } catch (e) {
            console.error('重做失败', e);
            alert(`重做 "${command.actionName}" 失败!`);
        }
    }, [redoStack]);

    const clearHistory = useCallback(() => {
        setUndoStack([]);
        setRedoStack([]);
    }, []);

    return (
        <UndoRedoContext.Provider value={{ pushCommand, undo, redo, canUndo: undoStack.length > 0, canRedo: redoStack.length > 0, clearHistory }}>
            {children}
        </UndoRedoContext.Provider>
    );
};

export const useUndoRedo = () => {
    const context = useContext(UndoRedoContext);
    if (!context) throw new Error("useUndoRedo must be used within UndoRedoProvider");
    return context;
};
