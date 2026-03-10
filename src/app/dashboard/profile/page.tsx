"use client";

import { useEffect, useState, useCallback } from "react";
import { ProfileEditor } from "../components/ProfileEditor";

interface InteractionRecord {
  id: number;
  action: string;
  createdAt: string;
  eventTitle: string;
  eventVenue: string;
}

export default function ProfilePage() {
  const [profileText, setProfileText] = useState("");
  const [version, setVersion] = useState(0);
  const [history, setHistory] = useState<InteractionRecord[]>([]);

  const fetchProfile = useCallback(async () => {
    const res = await fetch("/api/profile");
    const data = await res.json();
    if (data.profile) {
      setProfileText(data.profile.profileText);
      setVersion(data.profile.version);
    }
    setHistory(data.history ?? []);
  }, []);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const handleSave = async (text: string) => {
    const res = await fetch("/api/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profileText: text }),
    });
    const data = await res.json();
    if (data.version) setVersion(data.version);
  };

  return (
    <div>
      <ProfileEditor
        initialText={profileText}
        version={version}
        onSave={handleSave}
      />

      <h3 className="font-bold text-sm mb-3">Interaction History</h3>
      {history.length === 0 ? (
        <p className="text-gray-400 text-xs">No interactions yet.</p>
      ) : (
        <div className="space-y-2">
          {history.map((item) => (
            <div key={item.id} className="bg-white border border-gray-200 rounded-lg p-3 text-sm">
              <div className="flex items-center gap-2">
                <span>
                  {item.action === "thumbs_up" && "👍"}
                  {item.action === "thumbs_down" && "👎"}
                  {item.action === "calendar_added" && "📅"}
                </span>
                <span className="font-medium">{item.eventTitle}</span>
                <span className="text-gray-400 text-xs">at {item.eventVenue}</span>
              </div>
              <p className="text-xs text-gray-300 mt-1">
                {new Date(item.createdAt).toLocaleString()}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
