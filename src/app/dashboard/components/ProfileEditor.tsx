"use client";

import { useState, useEffect } from "react";

interface ProfileEditorProps {
  initialText: string;
  version: number;
  onSave: (text: string) => void;
}

export function ProfileEditor({ initialText, version, onSave }: ProfileEditorProps) {
  const [text, setText] = useState(initialText);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setText(initialText);
    setDirty(false);
  }, [initialText]);

  const handleChange = (val: string) => {
    setText(val);
    setDirty(val !== initialText);
  };

  const handleSave = () => {
    onSave(text);
    setDirty(false);
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 mb-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-sm">Preference Profile</h3>
        <span className="text-xs text-gray-400">v{version}</span>
      </div>
      <textarea
        value={text}
        onChange={(e) => handleChange(e.target.value)}
        className="w-full border border-gray-200 rounded px-3 py-2 text-sm h-40 resize-y"
      />
      <button
        onClick={handleSave}
        disabled={!dirty}
        className="mt-2 w-full bg-gray-900 text-white rounded py-2 text-sm font-medium hover:bg-gray-800 disabled:opacity-30"
      >
        Save Changes
      </button>
    </div>
  );
}
